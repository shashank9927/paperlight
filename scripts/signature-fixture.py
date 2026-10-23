"""Synthetic signature integrity oracle; never signs user documents."""
import datetime
import io
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs7
from cryptography.x509.oid import NameOID
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, ByteStringObject, DictionaryObject, NameObject, NumberObject, TextStringObject

path = Path(sys.argv[2])
if sys.argv[1] == 'create':
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'Paperlight synthetic test only')])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(subject).issuer_name(subject)
            .public_key(key.public_key()).serial_number(1)
            .not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=1)).sign(key, hashes.SHA256()))
    writer = PdfWriter()
    page = writer.add_blank_page(400, 500)
    signature = DictionaryObject({NameObject('/Type'): NameObject('/Sig'),
        NameObject('/Filter'): NameObject('/Adobe.PPKLite'),
        NameObject('/SubFilter'): NameObject('/adbe.pkcs7.detached'),
        NameObject('/ByteRange'): ArrayObject([NumberObject(1111111111)] * 4),
        NameObject('/Contents'): ByteStringObject(bytes(8192))})
    sig_ref = writer._add_object(signature)
    widget = DictionaryObject({NameObject('/Type'): NameObject('/Annot'), NameObject('/Subtype'): NameObject('/Widget'),
        NameObject('/FT'): NameObject('/Sig'), NameObject('/T'): TextStringObject('SyntheticSignature'),
        NameObject('/V'): sig_ref, NameObject('/Rect'): ArrayObject([NumberObject(0)] * 4),
        NameObject('/P'): page.indirect_reference})
    field = writer._add_object(widget)
    page[NameObject('/Annots')] = ArrayObject([field])
    writer._root_object[NameObject('/AcroForm')] = writer._add_object(DictionaryObject({
        NameObject('/Fields'): ArrayObject([field]), NameObject('/SigFlags'): NumberObject(3)}))
    output = io.BytesIO()
    writer.write(output)
    data = output.getvalue()
    match = re.search(rb'/Contents\s*(<0+>)', data)
    start, end = match.span(1)
    ranges = [0, start, end, len(data) - end]
    old = b'1111111111 1111111111 1111111111 1111111111'
    new = ' '.join(f'{value:010d}' for value in ranges).encode('ascii')
    assert len(old) == len(new) and old in data
    data = data.replace(old, new, 1)
    signed = data[:start] + data[end:]
    der = (pkcs7.PKCS7SignatureBuilder().set_data(signed).add_signer(cert, key, hashes.SHA256())
           .sign(serialization.Encoding.DER, [pkcs7.PKCS7Options.DetachedSignature, pkcs7.PKCS7Options.Binary]))
    encoded = der.hex().encode().ljust(end - start - 2, b'0')
    data = data[:start + 1] + encoded + data[end - 1:]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    print(json.dumps({'created': True, 'bytes': len(data)}))
else:
    data = path.read_bytes()
    reader = PdfReader(io.BytesIO(data), strict=True)
    sig = reader.get_fields()['SyntheticSignature']['/V']
    ranges = [int(v) for v in sig['/ByteRange']]
    contents = bytes(sig['/Contents'])
    executable = shutil.which('openssl') or str(Path('C:/Program Files/Git/usr/bin/openssl.exe'))
    with tempfile.TemporaryDirectory(prefix='paperlight-synthetic-signature-') as directory:
        directory = Path(directory)
        (directory / 'signature.der').write_bytes(contents)
        (directory / 'content.bin').write_bytes(data[ranges[0]:ranges[0] + ranges[1]] + data[ranges[2]:ranges[2] + ranges[3]])
        verified = subprocess.run([executable, 'cms', '-verify', '-binary', '-inform', 'DER', '-in', str(directory / 'signature.der'), '-content', str(directory / 'content.bin'), '-noverify', '-out', str(directory / 'verified.bin')], capture_output=True)
    print(json.dumps({'integrityValid': verified.returncode == 0, 'certificateTrust': 'self-signed synthetic fixture; not a trust-chain certification'}))
