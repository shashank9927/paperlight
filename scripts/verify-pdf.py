"""Development-only independent oracle. Input is JSON on stdin; never real user files."""
import json
import subprocess
import sys
from pathlib import Path
from pypdf import PdfReader
from pypdf.generic import IndirectObject, ArrayObject, DictionaryObject

sys.stdin.reconfigure(encoding='utf-8')
request = json.load(sys.stdin)
path = Path(request['path'])
reader = PdfReader(path, strict=True)
encrypted = reader.is_encrypted
if encrypted:
    password = request['password']
    if request.get('allowEmptyPassword', False):
        assert password == '' and PdfReader(path).decrypt('') == 1, 'Expected deliberate permissions-only encryption'
    else:
        assert PdfReader(path).decrypt('') == 0, 'Empty password bypass'
    assert PdfReader(path).decrypt('definitely-incorrect-password') == 0, 'Wrong password accepted'
    assert reader.decrypt(password) == 1, 'Expected opening password, not owner password'
    encryption = reader.trailer['/Encrypt']
    assert encryption['/V'] == 5 and encryption['/R'] == 6 and encryption['/Length'] == 256
else:
    assert '/Encrypt' not in reader.trailer

def identity(value):
    return (value.idnum, value.generation) if isinstance(value, IndirectObject) else id(value)

page_indices = {identity(page.indirect_reference): index for index, page in enumerate(reader.pages)}

def target_page(destination):
    if isinstance(destination, IndirectObject):
        destination = destination.get_object()
    if isinstance(destination, str):
        assert destination in reader.named_destinations, f'Unresolved destination: {destination}'
        return reader.get_destination_page_number(reader.named_destinations[destination])
    if isinstance(destination, DictionaryObject):
        destination = destination['/D']
    assert isinstance(destination, (list, ArrayObject)) and destination, 'Invalid destination'
    target = page_indices.get(identity(destination[0]))
    assert target is not None, 'Destination points outside output page tree'
    return target

def outline_items(first, parent, seen=None):
    seen = set() if seen is None else seen
    result = []
    while first:
        key = identity(first)
        assert key not in seen and len(seen) < 100000, 'Cyclic outline'
        seen.add(key)
        item = first.get_object()
        assert identity(item.raw_get('/Parent')) == identity(parent), 'Incorrect outline parent'
        destination = item.get('/Dest')
        action = item.get('/A', {}).get_object() if item.get('/A') else {}
        if action.get('/S') == '/GoTo':
            destination = action.get('/D')
        result.append({'title': str(item.get('/Title', '')), 'page': target_page(destination) if destination is not None else None,
                       'children': outline_items(item.get('/First'), first, seen)})
        first = item.get('/Next')
    return result

def number_tree(value):
    if value is None:
        return {}
    node = value.get_object()
    nums = node.get('/Nums', [])
    result = {int(nums[i]): nums[i + 1] for i in range(0, len(nums), 2)}
    for child in node.get('/Kids', []):
        entries = number_tree(child)
        assert not (result.keys() & entries.keys()), 'Duplicate parent-tree key'
        result.update(entries)
    return result

def inspect_tags():
    catalog = reader.trailer['/Root']
    root_ref = catalog.raw_get('/StructTreeRoot') if '/StructTreeRoot' in catalog else None
    if root_ref is None:
        return {'valid': True, 'pages': [], 'alt': [], 'languages': [], 'ids': [], 'roles': []}
    root = root_ref.get_object()
    parents = number_tree(root.get('/ParentTree'))
    visited, mapped_pages, alts, languages, ids, roles = set(), set(), [], [], [], []
    content_ids = {}
    for index, page in enumerate(reader.pages):
        content_ids[index] = set()
        if page.get_contents() is not None:
            for operands, operator in page.get_contents().operations:
                if operator == b'BDC' and len(operands) == 2 and isinstance(operands[1], DictionaryObject) and '/MCID' in operands[1]:
                    content_ids[index].add(int(operands[1]['/MCID']))

    def marked(mcid, parent, page_ref):
        index = page_indices.get(identity(page_ref))
        assert index is not None, 'Tagged content points outside page tree'
        page = reader.pages[index]
        assert '/StructParents' in page, 'Missing page StructParents'
        entry = parents[int(page['/StructParents'])].get_object()
        assert 0 <= mcid < len(entry) and identity(entry[mcid]) == identity(parent), 'Incorrect MCID parent mapping'
        assert mcid in content_ids[index], 'Structure refers to nonexistent marked content'
        mapped_pages.add(index)

    def walk(value, parent, page_ref=None, depth=0):
        assert depth < 65, 'Excessive structure depth'
        original_ref = value
        value = value.get_object() if hasattr(value, 'get_object') else value
        if isinstance(value, (list, ArrayObject)):
            for child in value:
                walk(child, parent, page_ref, depth + 1)
        elif isinstance(value, int):
            marked(value, parent, page_ref)
        elif isinstance(value, DictionaryObject):
            kind = value.get('/Type')
            page_ref = value.raw_get('/Pg') if '/Pg' in value else page_ref
            if kind == '/MCR':
                assert '/Stm' not in value, 'Oracle requires a dedicated XObject fixture'
                marked(int(value['/MCID']), parent, page_ref)
            elif kind == '/OBJR':
                obj_ref = value.raw_get('/Obj')
                annotation = obj_ref.get_object()
                assert identity(parents[int(annotation['/StructParent'])]) == identity(parent), 'Incorrect annotation parent mapping'
                index = page_indices.get(identity(page_ref))
                assert index is not None and any(identity(a) == identity(obj_ref) for a in reader.pages[index].get('/Annots', [])), 'Tag references an orphan annotation'
            else:
                assert kind == '/StructElem' and identity(value.raw_get('/P')) == identity(parent), 'Incorrect structure parent'
                key = identity(original_ref)
                assert key not in visited, 'Cyclic/shared structure node'
                visited.add(key)
                if '/Alt' in value:
                    alts.append(str(value['/Alt']))
                if '/Lang' in value:
                    languages.append(str(value['/Lang']))
                if '/ID' in value:
                    ids.append(str(value['/ID']))
                role = value.get('/S')
                role_map = root.get('/RoleMap', {})
                for _ in range(64):
                    if role not in role_map:
                        break
                    role = role_map[role]
                else:
                    raise AssertionError('Cyclic role mapping')
                roles.append(str(role))
                if '/K' in value:
                    walk(value.raw_get('/K'), original_ref, page_ref, depth + 1)
        else:
            raise AssertionError('Unsupported structure content')

    if '/K' in root:
        walk(root.raw_get('/K'), root_ref)
    assert len(ids) == len(set(ids)), 'Duplicate structure IDs'
    for index, page in enumerate(reader.pages):
        if '/StructParents' in page:
            assert index in mapped_pages, 'Tagged page has no mapped content'
    return {'valid': True, 'pages': sorted(mapped_pages), 'alt': alts, 'languages': languages, 'ids': ids, 'roles': roles}

catalog = reader.trailer['/Root']
outlines = catalog.raw_get('/Outlines') if '/Outlines' in catalog else None
internal_links = []
for index, page in enumerate(reader.pages):
    for ref in page.get('/Annots', []):
        annotation = ref.get_object()
        destination = annotation.get('/Dest')
        action = annotation.get('/A', {}).get_object() if annotation.get('/A') else {}
        if action.get('/S') == '/GoTo':
            destination = action.get('/D')
        if destination is not None:
            internal_links.append({'page': index, 'target': target_page(destination)})
preservation = {
    'outlines': outline_items(outlines.get_object().get('/First'), outlines) if outlines else [],
    'destinations': [{'name': name, 'page': reader.get_destination_page_number(value)} for name, value in reader.named_destinations.items()],
    'internalLinks': internal_links, 'tags': inspect_tags(),
}
pages = []
for page in reader.pages:
    annotations = []
    for ref in page.get('/Annots', []):
        annotation = ref.get_object()
        parent = annotation.get('/Parent', annotation).get_object()
        annotations.append({
            'type': str(annotation.get('/Subtype')),
            'uri': str(annotation.get('/A', {}).get('/URI', '')),
            'value': str(parent.get('/V', '')),
            'appearance': bool(annotation.get('/AP', {}).get('/N')),
        })
    pages.append({
        'text': page.extract_text(), 'rotation': page.rotation,
        'media': [float(v) for v in page.mediabox],
        'crop': [float(v) for v in page.cropbox], 'annotations': annotations,
    })
report = {'preservation': preservation, 'permissions': int(reader.trailer['/Encrypt']['/P']) if encrypted else None, 'encrypted': encrypted, 'count': len(pages), 'pages': pages,
          'fields': {name: str(value.get('/V', '')) for name, value in (reader.get_fields() or {}).items()}}
if not encrypted:
    info = subprocess.run(['pdfinfo', str(path)], capture_output=True, check=True)
    # Always render at least one page with a separate engine. Optional page index
    # supports placement assertions on every quarter turn.
    page = str(request.get('page', 1))
    prefix = str(path.with_suffix('')) + '-poppler-' + page
    subprocess.run(['pdftoppm', '-cropbox', '-r', '72', '-f', page, '-l', page,
                    '-singlefile', '-png', str(path), prefix], capture_output=True, check=True)
    report['render'] = prefix + '.png'
print(json.dumps(report, ensure_ascii=True))
