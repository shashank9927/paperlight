"""Development-only independent oracle. Input is JSON on stdin; never real user files."""
import json
import subprocess
import sys
from pathlib import Path
from pypdf import PdfReader

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
report = {'permissions': int(reader.trailer['/Encrypt']['/P']) if encrypted else None, 'encrypted': encrypted, 'count': len(pages), 'pages': pages,
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
