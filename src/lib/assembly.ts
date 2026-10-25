import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFRawStream,
  PDFRef,
  PDFString,
  PDFOperator,
  PDFOperatorNames,
} from 'pdf-lib';
import type { PDFContext, PDFPage } from 'pdf-lib';
import { MAX_OBJECTS, checkOutput } from './limits';

const n = PDFName.of;
const text = (value: PDFObject | undefined) =>
  value instanceof PDFString || value instanceof PDFHexString
    ? value.decodeText()
    : value instanceof PDFName
      ? value.decodeText()
      : undefined;
export interface AssemblyPage {
  source: number;
  index: number;
  rotation: number;
}
export interface AssemblySource {
  document: PDFDocument;
  name: string;
}
export interface CompatibilityIssue {
  source: string;
  feature: string;
  reason: string;
}
export class PreservationError extends Error {
  readonly issues: CompatibilityIssue[];
  constructor(source: string, feature: string, reason: string) {
    super(
      `${source}: This operation cannot safely preserve ${feature}. ${reason} Your original is unchanged.`,
    );
    this.name = 'PreservationError';
    this.issues = [{ source, feature, reason }];
  }
}

// A bounded object copier with explicit page bindings. Unlike copyPages(), it
// never follows a destination into an orphan page tree or drops catalog data.
class Copier {
  readonly mapped = new Map<PDFObject, PDFObject>();
  readonly navigation = new Map<PDFObject, PDFObject>();
  currentPage?: { source: PDFRef; output: PDFRef };
  constructor(
    readonly source: AssemblySource,
    readonly target: PDFContext,
    readonly pages: Set<PDFObject>,
    readonly destinations: Map<string, string>,
    readonly budget: { objects: number; bytes: number },
  ) {}
  fail(feature: string, reason: string): never {
    throw new PreservationError(this.source.name, feature, reason);
  }
  destination(value: PDFObject, depth = 0): PDFObject {
    if (depth > 64)
      return this.fail(
        'internal destinations',
        'A destination contains a cycle or excessive nesting.',
      );
    const label = text(value);
    if (label !== undefined) {
      const renamed = this.destinations.get(label);
      if (!renamed)
        return this.fail('named destinations', 'An internal link has no resolvable destination.');
      return PDFHexString.fromText(renamed);
    }
    const original = this.source.document.context.lookup(value);
    if (original instanceof PDFDict) {
      const target = original.get(n('D'));
      if (!target)
        return this.fail('internal destinations', 'A destination dictionary has no target.');
      const result = PDFDict.withContext(this.target);
      for (const [key, item] of original.entries())
        result.set(
          key,
          key === n('D') ? this.destination(item, depth + 1) : this.copy(item, depth + 1),
        );
      return result;
    }
    if (!(original instanceof PDFArray) || !this.pages.has(original.get(0)))
      return this.fail(
        'internal destinations',
        'An internal destination does not identify a document page.',
      );
    const page = original.get(0);
    const target =
      page === this.currentPage?.source ? this.currentPage.output : this.navigation.get(page);
    if (!target)
      return this.fail(
        'internal destinations',
        'A link or bookmark targets a page excluded from the output. Include that page.',
      );
    return this.target.obj([
      target,
      ...original
        .asArray()
        .slice(1)
        .map((item) => this.copy(item, depth + 1)),
    ]);
  }
  copy(value: PDFObject, depth = 0): PDFObject {
    const known = this.mapped.get(value);
    if (known) return known;
    if (depth > 64 || ++this.budget.objects > MAX_OBJECTS)
      return this.fail('document structure', 'The assembly exceeds the safe complexity limit.');
    if (this.pages.has(value))
      return this.fail(
        'internal destinations',
        'A link or bookmark targets a page excluded from the output. Include that page.',
      );
    if (value instanceof PDFRef) {
      const original = this.source.document.context.lookup(value);
      if (!original)
        return this.fail('object references', 'The document contains a missing object.');
      const ref = this.target.nextRef();
      this.mapped.set(value, ref);
      this.target.assign(ref, this.copy(original, depth + 1));
      return ref;
    }
    if (value instanceof PDFArray) {
      const result = PDFArray.withContext(this.target);
      this.mapped.set(value, result);
      for (const item of value.asArray()) result.push(this.copy(item, depth + 1));
      return result;
    }
    if (value instanceof PDFRawStream) {
      this.budget.bytes += value.getContentsSize();
      checkOutput(this.budget.bytes);
      const result = PDFRawStream.of(PDFDict.withContext(this.target), value.getContents().slice());
      this.mapped.set(value, result);
      for (const [key, item] of value.dict.entries())
        result.dict.set(key, this.copy(item, depth + 1));
      return result;
    }
    if (value instanceof PDFDict) {
      const result = PDFDict.withContext(this.target);
      this.mapped.set(value, result);
      for (const [key, item] of value.entries()) {
        const destination =
          key === n('Dest') || (key === n('D') && value.get(n('S')) === n('GoTo'));
        result.set(
          key,
          destination ? this.destination(item, depth + 1) : this.copy(item, depth + 1),
        );
      }
      return result;
    }
    return value.clone(this.target);
  }
}

function nameTree(document: PDFDocument, root: PDFObject | undefined): [string, PDFObject][] {
  const values: [string, PDFObject][] = [],
    seen = new Set<PDFObject>();
  const visit = (value: PDFObject | undefined, depth: number) => {
    if (!value) return;
    const node = document.context.lookup(value);
    if (!(node instanceof PDFDict) || seen.has(node) || depth > 64 || seen.size > MAX_OBJECTS)
      throw new Error('The document contains an invalid or cyclic name/number tree.');
    seen.add(node);
    const entries = node.lookupMaybe(n('Names'), PDFArray) || node.lookupMaybe(n('Nums'), PDFArray);
    if (entries) {
      if (entries.size() % 2)
        throw new Error('The document contains an incomplete name/number tree.');
      for (let i = 0; i < entries.size(); i += 2) {
        const key = entries.get(i);
        values.push([
          key instanceof PDFNumber ? String(key.asNumber()) : (text(key) ?? ''),
          entries.get(i + 1),
        ]);
      }
    }
    const kids = node.lookupMaybe(n('Kids'), PDFArray);
    if (kids) for (const child of kids.asArray()) visit(child, depth + 1);
  };
  visit(root, 0);
  return values;
}

/** Assemble selected pages without discarding navigation or supported tag trees. */
export async function assemblePdf(sources: AssemblySource[], selection: AssemblyPage[]) {
  if (!selection.length || selection.length > 500)
    throw new Error('Keep between 1 and 500 output pages.');
  const output = await PDFDocument.create();
  const ctx = output.context;
  const budget = { objects: 0, bytes: 0 };
  const occurrences = sources.map(() => new Map<number, number>());
  const records = selection.map((item) => {
    const input = sources[item.source]?.document.getPages()[item.index];
    if (!input) throw new Error('A selected page is no longer available.');
    const lane = occurrences[item.source].get(item.index) || 0;
    occurrences[item.source].set(item.index, lane + 1);
    return { ...item, input, lane, output: output.addPage([input.getWidth(), input.getHeight()]) };
  });
  const destinationPairs: [string, PDFObject][] = [];
  const firstCopiers = new Map<number, Copier>();
  const outlineRoots: PDFRef[] = [];
  const structureRoots: PDFRef[] = [];
  const parentEntries: [number, PDFObject][] = [];
  const idEntries: [string, PDFObject][] = [];
  const roleMap = PDFDict.withContext(ctx),
    classMap = PDFDict.withContext(ctx);
  const tagRoot = PDFDict.withContext(ctx),
    tagRootRef = ctx.register(tagRoot);
  tagRoot.set(n('Type'), n('StructTreeRoot'));
  const outlineRoot = PDFDict.withContext(ctx),
    outlineRootRef = ctx.register(outlineRoot);
  outlineRoot.set(n('Type'), n('Outlines'));
  let nextParent = 0;

  for (const [sourceIndex, source] of sources.entries()) {
    const doc = source.document,
      sourcePages = doc.getPages();
    const own = records.filter((record) => record.source === sourceIndex);
    if (!own.length) continue;
    const pageObjects = new Set<PDFObject>(sourcePages.flatMap((page) => [page.ref, page.node]));
    const names = doc.catalog.lookupMaybe(n('Names'), PDFDict);
    const rawDestinations = nameTree(doc, names?.get(n('Dests')));
    const legacy = doc.catalog.lookupMaybe(n('Dests'), PDFDict);
    if (legacy)
      for (const [key, value] of legacy.entries()) rawDestinations.push([key.decodeText(), value]);
    const destinationNames = new Map(
      rawDestinations.map(([key]) => [key, `pl-${sourceIndex + 1}-base:${key}`]),
    );
    if (destinationNames.size !== rawDestinations.length)
      throw new PreservationError(
        source.name,
        'named destinations',
        'Duplicate names are ambiguous within this document.',
      );
    const sourceTags = doc.catalog.lookupMaybe(n('StructTreeRoot'), PDFDict);
    const sourceParents = new Map(nameTree(doc, sourceTags?.get(n('ParentTree'))));
    if (sourceTags) {
      const supported = new Set([
        'Type',
        'K',
        'ParentTree',
        'ParentTreeNextKey',
        'IDTree',
        'RoleMap',
        'ClassMap',
      ]);
      for (const key of sourceTags.keys())
        if (!supported.has(key.decodeText()))
          throw new PreservationError(
            source.name,
            'accessibility tags',
            `${key.decodeText()} structures are not yet supported by the preservation adapter.`,
          );
      for (const key of ['Namespaces', 'AF', 'PronunciationLexicon'])
        if (sourceTags.has(n(key)))
          throw new PreservationError(
            source.name,
            'accessibility tags',
            `${key} structures are not yet supported by the preservation adapter.`,
          );
      for (const [, object] of doc.context.enumerateIndirectObjects())
        if (object instanceof PDFRawStream && object.dict.has(n('StructParents')))
          throw new PreservationError(
            source.name,
            'accessibility tags',
            'Tagged form XObjects require a dedicated structure mapping.',
          );
    }
    try {
      validateAssembly(doc);
    } catch (error) {
      throw new PreservationError(
        source.name,
        'document navigation or accessibility tags',
        error instanceof Error ? error.message : 'The source references are inconsistent.',
      );
    }
    const roles = sourceTags?.lookupMaybe(n('RoleMap'), PDFDict);
    const classes = sourceTags?.lookupMaybe(n('ClassMap'), PDFDict);
    const renameRole = (value: PDFName) =>
      roles?.has(value) ? n(`pl-${sourceIndex + 1}-${value.decodeText()}`) : value;
    const renameClass = (value: PDFObject): PDFObject => {
      if (value instanceof PDFName && classes?.has(value))
        return n(`pl-${sourceIndex + 1}-${value.decodeText()}`);
      if (value instanceof PDFArray) return ctx.obj(value.asArray().map(renameClass));
      return value;
    };
    const maxLane = Math.max(...own.map((record) => record.lane));
    for (let lane = 0; lane <= maxLane; lane++) {
      const lanePages = own.filter((record) => record.lane === lane);
      const copier = new Copier(source, ctx, pageObjects, new Map(destinationNames), budget);
      if (lane === 0) firstCopiers.set(sourceIndex, copier);
      // Navigation resolves to the first output occurrence, with self-links on a
      // duplicate resolving to that duplicate. Page order never determines refs.
      for (const record of own.filter((entry) => entry.lane === 0)) {
        copier.mapped.set(record.input.ref, record.output.ref);
        copier.mapped.set(record.input.node, record.output.node);
        copier.navigation.set(record.input.ref, record.output.ref);
        copier.navigation.set(record.input.node, record.output.node);
      }
      for (const record of lanePages) {
        copier.mapped.set(record.input.ref, record.output.ref);
        copier.mapped.set(record.input.node, record.output.node);
      }
      for (const record of lanePages) {
        copier.currentPage = { source: record.input.ref, output: record.output.ref };
        copier.destinations.clear();
        for (const [key, value] of destinationNames) copier.destinations.set(key, value);
        if (lane > 0)
          for (const [key, value] of rawDestinations) {
            let target = doc.context.lookup(value);
            if (target instanceof PDFDict) target = doc.context.lookup(target.get(n('D')));
            if (target instanceof PDFArray && target.get(0) === record.input.ref) {
              const alias = `pl-${sourceIndex + 1}-copy:${lane}:${record.index}:${key}`;
              destinationPairs.push([alias, copier.destination(value)]);
              copier.destinations.set(key, alias);
            }
          }
        for (const [key, value] of record.input.node.entries())
          if (![n('Parent'), n('StructParents')].includes(key))
            record.output.node.set(key, copier.copy(value));
        for (const key of ['Resources', 'MediaBox', 'CropBox', 'Rotate']) {
          const value = record.input.node.getInheritableAttribute(n(key));
          if (value) record.output.node.set(n(key), copier.copy(value));
        }
        record.output.node.set(
          n('Rotate'),
          PDFNumber.of((record.input.getRotation().angle + record.rotation) % 360),
        );
      }
      copier.currentPage = undefined;
      copier.destinations.clear();
      for (const [key, value] of destinationNames) copier.destinations.set(key, value);
      if (lane === 0) {
        if (sourceIndex === records[0].source) {
          for (const key of [
            'Lang',
            'Metadata',
            'PageMode',
            'PageLayout',
            'ViewerPreferences',
            'Version',
          ]) {
            const value = doc.catalog.get(n(key));
            if (value) output.catalog.set(n(key), copier.copy(value));
          }
          const info = doc.context.trailerInfo.Info;
          if (info) ctx.trailerInfo.Info = copier.copy(info) as PDFRef;
        }
        for (const [key, value] of rawDestinations)
          destinationPairs.push([destinationNames.get(key)!, copier.destination(value)]);
        if (roles)
          for (const [key, value] of roles.entries()) {
            if (!(value instanceof PDFName))
              copier.fail('role mappings', 'A structure role has an invalid mapping.');
            roleMap.set(renameRole(key), renameRole(value as PDFName));
          }
        if (classes)
          for (const [key, value] of classes.entries())
            classMap.set(renameClass(key) as PDFName, copier.copy(value));
        const outlines = doc.catalog.lookupMaybe(n('Outlines'), PDFDict);
        const visited = new Set<PDFDict>();
        const copyOutlines = (
          first: PDFObject | undefined,
          parent: PDFRef,
          depth: number,
        ): PDFRef[] => {
          const siblings: PDFRef[] = [];
          let current = first;
          while (current) {
            const original = doc.context.lookup(current);
            if (
              !(original instanceof PDFDict) ||
              visited.has(original) ||
              depth > 64 ||
              visited.size > MAX_OBJECTS
            )
              return copier.fail(
                'bookmarks',
                'The outline contains a cycle or exceeds its safe limit.',
              );
            visited.add(original);
            const bookmark = PDFDict.withContext(ctx),
              ref = ctx.register(bookmark);
            for (const [key, value] of original.entries())
              if (
                ![n('Parent'), n('First'), n('Last'), n('Prev'), n('Next'), n('Count')].includes(
                  key,
                )
              ) {
                bookmark.set(
                  key,
                  key === n('Dest') ? copier.destination(value) : copier.copy(value),
                );
              }
            bookmark.set(n('Parent'), parent);
            const children = copyOutlines(original.get(n('First')), ref, depth + 1);
            if (children.length) {
              bookmark.set(n('First'), children[0]);
              bookmark.set(n('Last'), children.at(-1)!);
              const originalCount = original.lookupMaybe(n('Count'), PDFNumber)?.asNumber() || 0;
              const visible = children.reduce(
                (sum, child) =>
                  sum +
                  1 +
                  Math.max(
                    0,
                    ctx.lookup(child, PDFDict).lookupMaybe(n('Count'), PDFNumber)?.asNumber() || 0,
                  ),
                0,
              );
              bookmark.set(n('Count'), PDFNumber.of((originalCount < 0 ? -1 : 1) * visible));
            }
            if (siblings.length) {
              bookmark.set(n('Prev'), siblings.at(-1)!);
              ctx.lookup(siblings.at(-1)!, PDFDict).set(n('Next'), ref);
            }
            siblings.push(ref);
            current = original.get(n('Next'));
          }
          return siblings;
        };
        outlineRoots.push(...copyOutlines(outlines?.get(n('First')), outlineRootRef, 0));
      }
      if (!sourceTags) continue;
      const pageByRef = new Map(lanePages.map((record) => [record.input.ref, record]));
      const annotationPages = new Map<PDFObject, (typeof lanePages)[number]>();
      for (const record of lanePages) {
        const annots = record.input.node.lookupMaybe(n('Annots'), PDFArray);
        if (annots) for (const ref of annots.asArray()) annotationPages.set(ref, record);
      }
      const tagNodes = new Set<PDFDict>();
      const originalOwners = new Map<PDFRef, PDFDict>();
      const pageParents = new Map<PDFRef, Map<number, PDFRef>>();
      const checkSourceParent = (key: number, mcid: number | undefined, original: PDFDict) => {
        const entry = sourceParents.get(String(key));
        const value = entry && doc.context.lookup(entry);
        const parent =
          mcid === undefined
            ? value
            : value instanceof PDFArray
              ? doc.context.lookup(value.get(mcid))
              : undefined;
        if (parent !== original)
          copier.fail(
            'accessibility tags',
            'The source parent tree does not match its marked content.',
          );
      };
      const copyTag = (
        value: PDFObject,
        parent: PDFRef,
        inheritedPage?: PDFObject,
        depth = 0,
      ): PDFObject | undefined => {
        if (depth > 64 || ++budget.objects > MAX_OBJECTS)
          return copier.fail(
            'accessibility tags',
            'The structure tree exceeds the safe complexity limit.',
          );
        const original = doc.context.lookup(value);
        if (original instanceof PDFArray) {
          const children = original
            .asArray()
            .map((child) => copyTag(child, parent, inheritedPage, depth + 1))
            .filter((child): child is PDFObject => child !== undefined);
          return children.length ? ctx.obj(children) : undefined;
        }
        if (original instanceof PDFNumber) {
          if (!inheritedPage || !pageObjects.has(inheritedPage))
            return copier.fail(
              'accessibility tags',
              'Marked content has no valid source page association.',
            );
          const record = pageByRef.get(inheritedPage as PDFRef);
          if (!record) return undefined;
          const mcid = original.asNumber();
          if (!Number.isSafeInteger(mcid) || mcid < 0 || mcid > 100000)
            return copier.fail('accessibility tags', 'A marked-content identifier is invalid.');
          const sourceOwner = originalOwners.get(parent);
          if (!(sourceOwner instanceof PDFDict))
            return copier.fail('accessibility tags', 'A marked-content parent is missing.');
          const key = record.input.node.lookupMaybe(n('StructParents'), PDFNumber)?.asNumber();
          if (key === undefined)
            return copier.fail(
              'accessibility tags',
              'A tagged page is missing its parent-tree key.',
            );
          checkSourceParent(key, mcid, sourceOwner);
          const entries = pageParents.get(record.output.ref) || new Map<number, PDFRef>();
          if (entries.has(mcid))
            return copier.fail(
              'accessibility tags',
              'A marked-content identifier has multiple parents.',
            );
          entries.set(mcid, parent);
          pageParents.set(record.output.ref, entries);
          return original;
        }
        if (!(original instanceof PDFDict))
          return copier.fail(
            'accessibility tags',
            'The structure contains an unsupported content item.',
          );
        const type = original.get(n('Type'));
        const page = original.get(n('Pg')) || inheritedPage;
        if (type === n('MCR')) {
          if (original.has(n('Stm')))
            return copier.fail('accessibility tags', 'Tagged form XObjects are not supported.');
          if (!page || !pageObjects.has(page))
            return copier.fail(
              'accessibility tags',
              'A marked-content reference has no valid source page.',
            );
          if (!pageByRef.has(page as PDFRef)) return undefined;
          const mcid = original.get(n('MCID'));
          if (!(mcid instanceof PDFNumber))
            return copier.fail('accessibility tags', 'A content reference has no identifier.');
          copyTag(mcid, parent, page, depth + 1);
          const copiedReference = copier.copy(original) as PDFDict;
          copiedReference.set(n('Pg'), pageByRef.get(page as PDFRef)!.output.ref);
          return copiedReference;
        }
        if (type === n('OBJR')) {
          const object = original.get(n('Obj'));
          const record = pageByRef.get(page as PDFRef) || (object && annotationPages.get(object));
          if (!record) return undefined;
          if (!object || !annotationPages.has(object))
            return copier.fail(
              'accessibility tags',
              'A tagged object is not a retained annotation.',
            );
          const annotation = doc.context.lookup(object, PDFDict);
          const key = annotation.lookupMaybe(n('StructParent'), PDFNumber)?.asNumber();
          if (key === undefined)
            return copier.fail('accessibility tags', 'A tagged annotation has no parent-tree key.');
          const sourceOwner = originalOwners.get(parent);
          if (!(sourceOwner instanceof PDFDict))
            return copier.fail('accessibility tags', 'An annotation parent is missing.');
          checkSourceParent(key, undefined, sourceOwner);
          const copied = ctx.lookup(copier.copy(object), PDFDict);
          copied.set(n('StructParent'), PDFNumber.of(nextParent));
          parentEntries.push([nextParent++, parent]);
          const copiedReference = copier.copy(original) as PDFDict;
          copiedReference.set(n('Pg'), record.output.ref);
          return copiedReference;
        }
        if (type !== n('StructElem') && !(original.get(n('S')) instanceof PDFName))
          return copier.fail('accessibility tags', 'The structure element has no supported role.');
        if (tagNodes.has(original))
          return copier.fail(
            'accessibility tags',
            'The structure tree contains shared children or a cycle.',
          );
        tagNodes.add(original);
        const element = PDFDict.withContext(ctx),
          ref = ctx.register(element);
        originalOwners.set(ref, original);
        copier.mapped.set(original, element);
        if (value instanceof PDFRef) copier.mapped.set(value, ref);
        element.set(n('Type'), n('StructElem'));
        element.set(n('P'), parent);
        const kids = original.get(n('K'));
        const children = kids ? copyTag(kids, ref, page, depth + 1) : undefined;
        if (!children && (kids || lane > 0)) return undefined;
        if (children) element.set(n('K'), children);
        for (const [key, item] of original.entries()) {
          if ([n('Type'), n('P'), n('K'), n('Pg')].includes(key)) continue;
          if (key === n('Ref'))
            return copier.fail(
              'accessibility tags',
              'Cross-references between structure elements require a dedicated mapping.',
            );
          if (key === n('S') && item instanceof PDFName) element.set(key, renameRole(item));
          else if (key === n('C')) element.set(key, copier.copy(renameClass(item)));
          else if (key === n('ID')) {
            const id = text(item);
            if (id === undefined)
              return copier.fail('accessibility tags', 'A structure identifier is invalid.');
            const renamed = `pl-${sourceIndex + 1}-${lane}-${id}`;
            element.set(key, PDFHexString.fromText(renamed));
            idEntries.push([renamed, ref]);
          } else element.set(key, copier.copy(item));
        }
        if (pageByRef.has(page as PDFRef)) element.set(n('Pg'), copier.copy(page!));
        const lang = doc.catalog.get(n('Lang'));
        if (parent === tagRootRef && lang && !element.has(n('Lang')))
          element.set(n('Lang'), copier.copy(lang));
        return ref;
      };
      const kids = sourceTags.get(n('K'));
      if (kids) {
        const result = copyTag(kids, tagRootRef);
        if (result instanceof PDFArray) structureRoots.push(...(result.asArray() as PDFRef[]));
        else if (result instanceof PDFRef) structureRoots.push(result);
      }
      for (const record of lanePages) {
        const entries = pageParents.get(record.output.ref);
        if (!entries) {
          if (record.input.node.has(n('StructParents'))) {
            const key = record.input.node.lookup(n('StructParents'), PDFNumber).asNumber();
            const original = sourceParents.get(String(key));
            const array = original && doc.context.lookup(original);
            if (
              !(array instanceof PDFArray) ||
              array.asArray().some((value) => value.toString() !== 'null')
            )
              copier.fail(
                'accessibility tags',
                'A retained tagged page has unmapped marked content.',
              );
            record.output.node.set(n('StructParents'), PDFNumber.of(nextParent));
            parentEntries.push([nextParent++, copier.copy(array!)]);
          }
          continue;
        }
        const size = Math.max(...entries.keys()) + 1;
        const array = ctx.obj(Array.from({ length: size }, (_, i) => entries.get(i) || null));
        record.output.node.set(n('StructParents'), PDFNumber.of(nextParent));
        parentEntries.push([nextParent++, array]);
      }
    }
  }
  if (destinationPairs.length)
    output.catalog.set(
      n('Names'),
      ctx.obj({
        Dests: {
          Names: destinationPairs
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .flatMap(([key, value]) => [PDFHexString.fromText(key), value]),
        },
      }),
    );
  if (outlineRoots.length) {
    outlineRoots.forEach((ref, index) => {
      const entry = ctx.lookup(ref, PDFDict);
      if (index) entry.set(n('Prev'), outlineRoots[index - 1]);
      if (index + 1 < outlineRoots.length) entry.set(n('Next'), outlineRoots[index + 1]);
    });
    outlineRoot.set(n('First'), outlineRoots[0]);
    outlineRoot.set(n('Last'), outlineRoots.at(-1)!);
    outlineRoot.set(
      n('Count'),
      PDFNumber.of(
        outlineRoots.reduce(
          (sum, ref) =>
            sum +
            1 +
            Math.max(
              0,
              ctx.lookup(ref, PDFDict).lookupMaybe(n('Count'), PDFNumber)?.asNumber() || 0,
            ),
          0,
        ),
      ),
    );
    output.catalog.set(n('Outlines'), outlineRootRef);
  }
  if (
    !outlineRoots.length &&
    sources.some((source) => source.document.catalog.has(n('Outlines')))
  ) {
    outlineRoot.set(n('Count'), PDFNumber.of(0));
    output.catalog.set(n('Outlines'), outlineRootRef);
  }
  if (
    structureRoots.length ||
    sources.some((source) => source.document.catalog.has(n('StructTreeRoot')))
  ) {
    tagRoot.set(n('K'), ctx.obj(structureRoots));
    tagRoot.set(
      n('ParentTree'),
      ctx.obj({
        Nums: parentEntries
          .sort(([a], [b]) => a - b)
          .flatMap(([key, value]) => [PDFNumber.of(key), value]),
      }),
    );
    tagRoot.set(n('ParentTreeNextKey'), PDFNumber.of(nextParent));
    if (roleMap.keys().length) tagRoot.set(n('RoleMap'), roleMap);
    if (classMap.keys().length) tagRoot.set(n('ClassMap'), classMap);
    if (idEntries.length)
      tagRoot.set(
        n('IDTree'),
        ctx.obj({
          Names: idEntries
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .flatMap(([key, value]) => [PDFHexString.fromText(key), value]),
        }),
      );
    output.catalog.set(n('StructTreeRoot'), tagRootRef);
    output.catalog.set(
      n('MarkInfo'),
      ctx.obj({
        Marked: true,
        ...['Suspects', 'UserProperties'].reduce(
          (flags, key) => {
            if (
              sources.some(
                (source) =>
                  source.document.catalog
                    .lookupMaybe(n('MarkInfo'), PDFDict)
                    ?.get(n(key))
                    ?.toString() === 'true',
              )
            )
              flags[key] = true;
            return flags;
          },
          {} as Record<string, boolean>,
        ),
      }),
    );
  }
  // Page labels are independent of the structural tree. Preserve the effective
  // source label by starting a fresh label interval for every output page.
  const labels: PDFObject[] = [];
  for (const [index, record] of records.entries()) {
    const source = sources[record.source].document;
    const rules = nameTree(source, source.catalog.get(n('PageLabels')))
      .map(([key, value]) => [Number(key), source.context.lookup(value, PDFDict)] as const)
      .sort(([a], [b]) => a - b);
    const rule = rules.filter(([start]) => start <= record.index).at(-1);
    if (rule) {
      const label = PDFDict.withContext(ctx);
      for (const [key, value] of rule[1].entries())
        label.set(key, firstCopiers.get(record.source)!.copy(value));
      label.set(
        n('St'),
        PDFNumber.of(
          (rule[1].lookupMaybe(n('St'), PDFNumber)?.asNumber() || 1) + record.index - rule[0],
        ),
      );
      labels.push(PDFNumber.of(index), label);
    } else labels.push(PDFNumber.of(index), ctx.obj({ S: 'D', St: record.index + 1 }));
  }
  if (sources.some((source) => source.document.catalog.has(n('PageLabels'))))
    output.catalog.set(n('PageLabels'), ctx.obj({ Nums: labels }));
  if (ctx.enumerateIndirectObjects().length > MAX_OBJECTS)
    throw new Error('The assembled PDF exceeds the safe object limit.');
  const bytes = await output.save({ updateFieldAppearances: false });
  checkOutput(bytes.length);
  return bytes;
}

/** Check navigation and tag relationships after the final QPDF rewrite. */
export function validateAssembly(document: PDFDocument) {
  const pages = document.getPages(),
    context = document.context;
  const refs = new Map(pages.map((page, i) => [page.ref, i]));
  const names = document.catalog.lookupMaybe(n('Names'), PDFDict);
  const destinations = new Map(nameTree(document, names?.get(n('Dests'))));
  const legacy = document.catalog.lookupMaybe(n('Dests'), PDFDict);
  if (legacy)
    for (const [key, value] of legacy.entries()) destinations.set(key.decodeText(), value);
  const fail = (reason: string): never => {
    throw new Error(
      `The output failed preservation validation: ${reason}. No output was returned.`,
    );
  };
  const destination = (value: PDFObject, depth = 0): number => {
    if (depth > 64) return fail('cyclic destination');
    const label = text(value);
    if (label !== undefined) {
      const target = destinations.get(label);
      return target ? destination(target, depth + 1) : fail('unresolved named destination');
    }
    const object = context.lookup(value);
    if (object instanceof PDFDict) {
      const target = object.get(n('D'));
      return target ? destination(target, depth + 1) : fail('missing destination');
    }
    if (!(object instanceof PDFArray)) return fail('invalid destination');
    const index = refs.get(object.get(0) as PDFRef);
    return index === undefined ? fail('destination outside page tree') : index;
  };
  for (const value of destinations.values()) destination(value);
  const navigation: unknown[] = [];
  const inspectAction = (object: PDFDict) => {
    const direct = object.get(n('Dest'));
    if (direct) navigation.push(destination(direct));
    const action = object.lookupMaybe(n('A'), PDFDict);
    if (action?.get(n('S')) === n('GoTo')) {
      const target = action.get(n('D'));
      if (!target) fail('missing action destination');
      navigation.push(destination(target!));
    }
  };
  for (const page of pages) {
    const annotations = page.node.lookupMaybe(n('Annots'), PDFArray);
    if (annotations)
      for (const value of annotations.asArray()) inspectAction(context.lookup(value, PDFDict));
  }
  const visited = new Set<PDFDict>();
  const outline = (value: PDFObject | undefined, parent: PDFObject | undefined, depth = 0) => {
    while (value) {
      const object = context.lookup(value, PDFDict);
      if (depth > 64 || visited.has(object) || visited.size > MAX_OBJECTS)
        fail('invalid outline tree');
      visited.add(object);
      if (context.lookup(object.get(n('Parent'))) !== context.lookup(parent))
        fail('incorrect outline parent');
      navigation.push(text(object.get(n('Title'))));
      inspectAction(object);
      outline(object.get(n('First')), value, depth + 1);
      value = object.get(n('Next'));
    }
  };
  const outlines = document.catalog.get(n('Outlines'));
  if (outlines) outline(context.lookup(outlines, PDFDict).get(n('First')), outlines);
  const root = document.catalog.get(n('StructTreeRoot'));
  const tags: unknown[] = [];
  if (root) {
    const tree = context.lookup(root, PDFDict),
      parents = new Map(nameTree(document, tree.get(n('ParentTree'))));
    const seen = new Set<PDFDict>(),
      ids = new Set<string>();
    const visit = (value: PDFObject, parent: PDFObject, inherited?: PDFObject, depth = 0): void => {
      if (depth > 64 || seen.size > MAX_OBJECTS) fail('excessive structure tree');
      const object = context.lookup(value);
      if (object instanceof PDFArray) {
        for (const child of object.asArray()) visit(child, parent, inherited, depth + 1);
        return;
      }
      if (object instanceof PDFNumber) {
        const page = context.lookup(inherited, PDFDict);
        const key = page.lookupMaybe(n('StructParents'), PDFNumber)?.asNumber();
        const entry = key === undefined ? undefined : parents.get(String(key));
        const array = entry && context.lookup(entry);
        const index = object.asNumber();
        if (
          !(array instanceof PDFArray) ||
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index >= array.size() ||
          context.lookup(array.get(index)) !== context.lookup(parent)
        )
          fail('incorrect marked-content parent tree');
        if (!refs.has(inherited as PDFRef)) fail('tagged content outside page tree');
        tags.push([refs.get(inherited as PDFRef), index]);
        return;
      }
      if (!(object instanceof PDFDict)) return fail('invalid structure content');
      const page = object.get(n('Pg')) || inherited,
        type = object.get(n('Type'));
      if (type === n('MCR')) {
        const id = object.get(n('MCID'));
        if (!id) return fail('missing content identifier');
        visit(id, parent, page, depth + 1);
        return;
      }
      if (type === n('OBJR')) {
        const annotation = object.lookup(n('Obj'), PDFDict);
        const key = annotation.lookupMaybe(n('StructParent'), PDFNumber)?.asNumber();
        const target = key === undefined ? undefined : parents.get(String(key));
        if (!target || context.lookup(target) !== context.lookup(parent))
          fail('incorrect annotation parent');
        const index = refs.get(page as PDFRef);
        const annotations =
          index === undefined ? undefined : pages[index].node.lookupMaybe(n('Annots'), PDFArray);
        if (!annotations?.asArray().some((ref) => context.lookup(ref) === annotation))
          fail('orphan tagged annotation');
        tags.push(['annotation', index]);
        return;
      }
      if (seen.has(object) || context.lookup(object.get(n('P'))) !== context.lookup(parent))
        fail('incorrect structure hierarchy');
      seen.add(object);
      const id = text(object.get(n('ID')));
      if (id !== undefined) {
        if (ids.has(id)) fail('duplicate structure identifier');
        ids.add(id);
      }
      let role = object.get(n('S'));
      const roleMap = tree.lookupMaybe(n('RoleMap'), PDFDict);
      const rolePath = new Set<PDFObject>();
      while (roleMap && role instanceof PDFName && roleMap.has(role)) {
        if (rolePath.has(role) || rolePath.size >= 64) fail('cyclic accessibility role mapping');
        rolePath.add(role);
        role = roleMap.get(role);
      }
      if (!(role instanceof PDFName)) fail('invalid accessibility role');
      tags.push([
        String(role),
        text(object.get(n('Alt'))),
        text(object.get(n('ActualText'))),
        text(object.get(n('Lang'))),
        id,
      ]);
      const kids = object.get(n('K'));
      if (kids) visit(kids, value, page, depth + 1);
    };
    const kids = tree.get(n('K'));
    if (kids) visit(kids, root);
  }
  return JSON.stringify({ count: pages.length, navigation, tags });
}

/** Add semantic visual marks to an existing tagged PDF without flattening it. */
export function tagWriter(document: PDFDocument) {
  let rootRef = document.catalog.get(n('StructTreeRoot'));
  if (!rootRef) return undefined;
  const ctx = document.context,
    root = ctx.lookup(rootRef, PDFDict);
  if (!(rootRef instanceof PDFRef)) {
    rootRef = ctx.register(root);
    document.catalog.set(n('StructTreeRoot'), rootRef);
  }
  const parents = new Map(
    nameTree(document, root.get(n('ParentTree'))).map(([key, value]) => [Number(key), value]),
  );
  let nextKey = Math.max(-1, ...parents.keys()) + 1;
  return {
    begin(page: PDFPage, label: string, image: boolean) {
      let key = page.node.lookupMaybe(n('StructParents'), PDFNumber)?.asNumber();
      let entries = key === undefined ? undefined : parents.get(key);
      if (key === undefined) {
        key = nextKey++;
        entries = ctx.obj([]);
        parents.set(key, entries);
        page.node.set(n('StructParents'), PDFNumber.of(key));
      }
      const array = entries && ctx.lookup(entries);
      if (!(array instanceof PDFArray) || array.size() > MAX_OBJECTS)
        throw new Error('The existing accessibility parent tree cannot accept this field safely.');
      const mcid = array.size();
      const element = ctx.obj({
        Type: 'StructElem',
        S: image ? 'Figure' : 'Span',
        P: rootRef,
        Pg: page.ref,
        K: mcid,
        ...(image
          ? { Alt: PDFHexString.fromText(label) }
          : { ActualText: PDFHexString.fromText(label) }),
      });
      const ref = ctx.register(element);
      array.push(ref);
      const kids = root.get(n('K'));
      const existingKids = kids && ctx.lookup(kids);
      root.set(
        n('K'),
        ctx.obj([
          ...(existingKids instanceof PDFArray ? existingKids.asArray() : kids ? [kids] : []),
          ref,
        ]),
      );
      // Inline BDC property dictionaries are valid PDF operands; pdf-lib's
      // operator argument typing omits dictionaries (serialization supports it).
      return PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [
        n(image ? 'Figure' : 'Span'),
        ctx.obj({ MCID: mcid }) as unknown as PDFString,
      ]);
    },
    finish() {
      root.set(
        n('ParentTree'),
        ctx.obj({
          Nums: [...parents]
            .sort(([a], [b]) => a - b)
            .flatMap(([key, value]) => [PDFNumber.of(key), value]),
        }),
      );
      root.set(n('ParentTreeNextKey'), PDFNumber.of(nextKey));
    },
  };
}
