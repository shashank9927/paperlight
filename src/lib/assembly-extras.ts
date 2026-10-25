import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFPage,
  PDFRef,
  PDFString,
} from 'pdf-lib';

const n = PDFName.of;
const label = (value: PDFObject | undefined) =>
  value instanceof PDFString || value instanceof PDFHexString ? value.decodeText() : undefined;
interface Copier {
  mapped: Map<PDFObject, PDFObject>;
  copy(value: PDFObject): PDFObject;
  action(value: PDFObject): PDFObject | undefined;
  events(value: PDFObject): PDFDict | undefined;
  fail(feature: string, reason: string): never;
}
interface RecordPage {
  source: number;
  lane: number;
  input: PDFPage;
  output: PDFPage;
}

// Default appearance strings are PDF programs. Rewrite resource-name tokens,
// leaving comments, literal strings and hexadecimal strings untouched.
function appearance(value: string, names: Map<string, string>) {
  let output = '',
    i = 0;
  while (i < value.length) {
    const start = i,
      char = value[i++];
    if (char === '(') {
      let depth = 1;
      while (i < value.length && depth) {
        const c = value[i++];
        if (c === '\\') i++;
        else if (c === '(') depth++;
        else if (c === ')') depth--;
      }
    } else if (char === '%') {
      while (i < value.length && !/[\r\n]/.test(value[i])) i++;
    } else if (char === '<' && value[i] !== '<') {
      while (i < value.length && value[i++] !== '>') {}
    } else if (char === '/') {
      while (i < value.length && !/[\s()[\]<>{}/%]/.test(value[i])) i++;
      const name = PDFName.of(
        value
          .slice(start + 1, i)
          .replace(/#([\da-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))),
      ).decodeText();
      const renamed = names.get(name);
      if (renamed) {
        output += PDFName.of(renamed).toString();
        continue;
      }
    }
    output += value.slice(start, i);
  }
  return output;
}

/** Catalog structures whose references must be seeded before pages are copied. */
export class AssemblyExtras {
  private fields: PDFRef[] = [];
  private usedFields = new Set<string>();
  private resources: PDFDict;
  private calculation: PDFObject[] = [];
  private needAppearances = false;
  private signatureFlags = 0;
  private layerBindings = new Map<number, Map<PDFObject, PDFObject>>();
  private groups: PDFObject[] = [];
  private off: PDFObject[] = [];
  private orders: PDFObject[] = [];
  private application: PDFObject[] = [];
  private locked: PDFObject[] = [];
  private radio: PDFObject[] = [];
  private defaultLayer?: PDFDict;
  private configurations: {
    dict: PDFDict;
    groups: Set<PDFObject>;
    off: PDFObject[];
    defaultOrder: PDFObject;
    order: PDFObject;
  }[] = [];
  private layerNames = new Set<string>();
  constructor(
    private output: PDFDocument,
    private sources: { document: PDFDocument; name: string }[],
    private records: RecordPage[],
    private encode: (value: string, literal?: boolean) => PDFObject,
    private admit: () => void,
  ) {
    this.resources = output.context.obj({});
  }
  prepare(source: number, lane: number, copier: Copier) {
    this.prepareLayers(source, copier);
    this.prepareFields(source, lane, copier);
  }
  private prepareFields(source: number, lane: number, copier: Copier) {
    const document = this.sources[source].document,
      ctx = this.output.context;
    const form = document.catalog.lookupMaybe(n('AcroForm'), PDFDict);
    const widgets = new Set<PDFDict>();
    for (const record of this.records.filter(
      (record) => record.source === source && record.lane === lane,
    )) {
      const annotations = record.input.node.lookupMaybe(n('Annots'), PDFArray);
      for (const ref of annotations?.asArray() || []) {
        const annotation = document.context.lookup(ref, PDFDict);
        if (annotation.get(n('Subtype')) === n('Widget')) widgets.add(annotation);
      }
    }
    if (!form) {
      if (widgets.size) copier.fail('interactive forms', 'A widget has no document field tree.');
      return;
    }
    const fonts = new Map<string, string>();
    const sourceResources = form.lookupMaybe(n('DR'), PDFDict);
    if (sourceResources)
      for (const [category, value] of sourceResources.entries()) {
        const dict = document.context.lookup(value);
        if (dict instanceof PDFDict) {
          const target = this.resources.lookupMaybe(category, PDFDict) || ctx.obj({});
          for (const [key, resource] of dict.entries()) {
            const renamed = `pl-${source + 1}-${key.decodeText()}`;
            target.set(n(renamed), copier.copy(resource));
            if (category === n('Font')) fonts.set(key.decodeText(), renamed);
          }
          this.resources.set(category, target);
        } else if (!this.resources.has(category)) this.resources.set(category, copier.copy(value));
      }
    interface Field {
      original: PDFDict;
      ref: PDFRef;
      output: PDFDict;
      children: Field[];
      parent?: Field;
    }
    const visited = new Set<PDFDict>(),
      retained = new Set<PDFDict>(),
      nodes: Field[] = [];
    const walk = (value: PDFObject, depth = 0): Field | undefined => {
      this.admit();
      const original = document.context.lookup(value, PDFDict);
      if (depth > 64 || visited.has(original) || visited.size >= 100000)
        return copier.fail(
          'interactive forms',
          'The field tree is cyclic or exceeds its safe limit.',
        );
      visited.add(original);
      const kids = original.lookupMaybe(n('Kids'), PDFArray);
      const children = (kids?.asArray() || [])
        .map((item) => walk(item, depth + 1))
        .filter((item): item is Field => !!item);
      const widget = original.get(n('Subtype')) === n('Widget');
      if (widget ? !widgets.has(original) : kids ? !children.length : lane > 0) return undefined;
      const output = ctx.obj({}),
        ref = ctx.register(output);
      const field: Field = { original, output, ref, children };
      for (const child of children) child.parent = field;
      copier.mapped.set(original, ref);
      if (value instanceof PDFRef) copier.mapped.set(value, ref);
      retained.add(original);
      nodes.push(field);
      return field;
    };
    const roots = (form.lookupMaybe(n('Fields'), PDFArray)?.asArray() || [])
      .map((value) => walk(value))
      .filter((value): value is Field => !!value);
    for (const widget of widgets)
      if (!retained.has(widget))
        copier.fail('interactive forms', 'A retained widget is missing from the field tree.');
    const defaultAppearance = label(document.context.lookup(form.get(n('DA'))));
    for (const field of nodes) {
      for (const [key, value] of field.original.entries()) {
        if ([n('Kids'), n('Parent')].includes(key)) continue;
        if (key === n('A') || key === n('AA')) {
          const actions = key === n('A') ? copier.action(value) : copier.events(value);
          if (actions) field.output.set(key, actions);
          continue;
        }
        const string = key === n('DA') ? label(document.context.lookup(value)) : undefined;
        field.output.set(
          key,
          string === undefined ? copier.copy(value) : this.encode(appearance(string, fonts), true),
        );
      }
      if (field.children.length)
        field.output.set(n('Kids'), ctx.obj(field.children.map((child) => child.ref)));
      if (field.parent) field.output.set(n('Parent'), field.parent.ref);
    }
    for (const field of roots) {
      const originalName = label(document.context.lookup(field.original.get(n('T')))) || 'field';
      let name = lane ? `pl-${source + 1}-copy-${lane + 1}-${originalName}` : originalName;
      if (this.usedFields.has(name)) name = `pl-${source + 1}-${name}`;
      let suffix = 2;
      const base = name;
      while (this.usedFields.has(name)) name = `${base}-${suffix++}`;
      this.usedFields.add(name);
      field.output.set(n('T'), this.encode(name));
      if (!field.output.has(n('DA')) && defaultAppearance !== undefined)
        field.output.set(n('DA'), this.encode(appearance(defaultAppearance, fonts), true));
      if (!field.output.has(n('Q')) && form.has(n('Q')))
        field.output.set(n('Q'), copier.copy(form.get(n('Q'))!));
      this.fields.push(field.ref);
    }
    for (const value of form.lookupMaybe(n('CO'), PDFArray)?.asArray() || []) {
      const mapped = copier.mapped.get(value);
      if (mapped) this.calculation.push(mapped);
    }
    this.needAppearances ||= form.get(n('NeedAppearances'))?.toString() === 'true';
    this.signatureFlags |= form.lookupMaybe(n('SigFlags'), PDFNumber)?.asNumber() || 0;
  }
  private prepareLayers(source: number, copier: Copier) {
    const existing = this.layerBindings.get(source);
    if (existing) {
      for (const [key, value] of existing) copier.mapped.set(key, value);
      return;
    }
    const document = this.sources[source].document,
      ctx = this.output.context;
    const properties = document.catalog.lookupMaybe(n('OCProperties'), PDFDict);
    if (!properties) return;
    const values = properties.lookup(n('OCGs'), PDFArray).asArray();
    const bindings = new Map<PDFObject, PDFObject>();
    for (const value of values) {
      const original = document.context.lookup(value, PDFDict);
      const object = copier.copy(value);
      const copied = object instanceof PDFRef ? object : ctx.register(object);
      copier.mapped.set(value, copied);
      copier.mapped.set(original, copied);
      const target = ctx.lookup(copied, PDFDict);
      let name = label(document.context.lookup(original.get(n('Name'))));
      if (name !== undefined) {
        if (this.layerNames.has(name)) name = `pl-${source + 1}: ${name}`;
        this.layerNames.add(name);
        target.set(n('Name'), this.encode(name));
      }
      bindings.set(value, copied);
      bindings.set(original, copied);
      this.groups.push(copied);
    }
    this.layerBindings.set(source, bindings);
    const sourceGroups = new Set(values.map((value) => copier.copy(value)));
    const hidden = (configuration: PDFDict) => {
      const off = new Set<PDFObject>(
        configuration.get(n('BaseState')) === n('OFF') ? sourceGroups : [],
      );
      for (const value of configuration.lookupMaybe(n('ON'), PDFArray)?.asArray() || [])
        off.delete(copier.copy(value));
      for (const value of configuration.lookupMaybe(n('OFF'), PDFArray)?.asArray() || [])
        off.add(copier.copy(value));
      return [...off];
    };
    const defaults = properties.lookupMaybe(n('D'), PDFDict) || document.context.obj({});
    this.defaultLayer ||= ctx.lookup(copier.copy(defaults), PDFDict);
    this.off.push(...hidden(defaults));
    const order = defaults.get(n('Order'));
    const defaultOrder = order ? copier.copy(order) : ctx.obj([...sourceGroups]);
    this.orders.push(defaultOrder);
    for (const [key, target] of [
      ['AS', this.application],
      ['Locked', this.locked],
      ['RBGroups', this.radio],
    ] as const)
      for (const item of defaults.lookupMaybe(n(key), PDFArray)?.asArray() || [])
        target.push(copier.copy(item));
    for (const value of properties.lookupMaybe(n('Configs'), PDFArray)?.asArray() || []) {
      const configuration = document.context.lookup(value, PDFDict);
      const dict = ctx.lookup(copier.copy(value), PDFDict);
      const name = label(document.context.lookup(configuration.get(n('Name')))) || 'View';
      dict.set(n('Name'), this.encode(`pl-${source + 1}: ${name}`));
      this.configurations.push({
        dict,
        groups: sourceGroups,
        off: hidden(configuration),
        defaultOrder,
        order: dict.get(n('Order')) || defaultOrder,
      });
    }
  }
  finish() {
    const ctx = this.output.context;
    if (this.fields.length) {
      const form = ctx.obj({
        Fields: this.fields,
        DR: this.resources,
        NeedAppearances: this.needAppearances,
      });
      if (this.signatureFlags) form.set(n('SigFlags'), PDFNumber.of(this.signatureFlags));
      if (this.calculation.length) form.set(n('CO'), ctx.obj(this.calculation));
      this.output.catalog.set(n('AcroForm'), form);
    }
    if (this.groups.length) {
      const defaults = this.defaultLayer!;
      defaults.set(n('BaseState'), n('ON'));
      defaults.delete(n('ON'));
      defaults.set(n('OFF'), ctx.obj(this.off));
      defaults.set(n('Order'), ctx.obj(this.orders));
      for (const [key, values] of [
        ['AS', this.application],
        ['Locked', this.locked],
        ['RBGroups', this.radio],
      ] as const)
        if (values.length) defaults.set(n(key), ctx.obj(values));
      const properties = ctx.obj({ OCGs: this.groups, D: defaults });
      if (this.configurations.length) {
        for (const config of this.configurations) {
          config.dict.set(n('BaseState'), n('ON'));
          config.dict.delete(n('ON'));
          config.dict.set(
            n('OFF'),
            ctx.obj([...this.off.filter((value) => !config.groups.has(value)), ...config.off]),
          );
          config.dict.set(
            n('Order'),
            ctx.obj(
              this.orders.map((order) => (order === config.defaultOrder ? config.order : order)),
            ),
          );
        }
        properties.set(n('Configs'), ctx.obj(this.configurations.map((config) => config.dict)));
      }
      this.output.catalog.set(n('OCProperties'), properties);
    }
  }
}
