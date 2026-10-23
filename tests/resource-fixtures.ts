import { deflateSync } from 'node:zlib';

export function rawPdf(objects: Array<string | Buffer>): Buffer {
  const parts = [Buffer.from('%PDF-1.7\n')];
  const offsets = [0];
  let length = parts[0].length;
  for (const [i, object] of objects.entries()) {
    offsets.push(length);
    const part = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`),
      Buffer.isBuffer(object) ? object : Buffer.from(object),
      Buffer.from('\nendobj\n'),
    ]);
    parts.push(part);
    length += part.length;
  }
  parts.push(
    Buffer.from(
      `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
        .join(
          '',
        )}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(parts);
}
const base = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
];
export function hostilePdf(
  kind: 'expansion' | 'object-expansion' | 'nesting' | 'xref' | 'cycle' | 'object-count' | 'image',
) {
  if (kind === 'cycle') return rawPdf([base[0], '<< /Type /Pages /Kids [2 0 R] /Count 1 >>']);
  if (kind === 'nesting') return rawPdf([...base, '['.repeat(100) + '1' + ']'.repeat(100)]);
  if (kind === 'xref')
    return rawPdf([
      ...base,
      '<< /Type /XRef /Size 999999999 /W [1 4 2] /Length 0 >>\nstream\n\nendstream',
    ]);
  if (kind === 'object-count')
    return rawPdf([
      ...base,
      '<< /Type /ObjStm /N 999999999 /First 0 /Length 0 >>\nstream\n\nendstream',
    ]);
  if (kind === 'image')
    return rawPdf([
      ...base,
      '<< /Type /XObject /Subtype /Image /Width 100000 /Height 100000 /Length 0 >>\nstream\n\nendstream',
    ]);
  const compressed = deflateSync(Buffer.alloc(65 * 1024 * 1024, 32));
  return rawPdf([
    ...base,
    Buffer.concat([
      Buffer.from(
        `<< ${kind === 'object-expansion' ? '/Type /ObjStm /N 1 /First 0 ' : ''}/Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`,
      ),
      compressed,
      Buffer.from('\nendstream'),
    ]),
  ]);
}

export function boundaryPdf(pages: number, bytes?: number) {
  const objects: Array<string | Buffer> = [
    base[0],
    `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${i + 3} 0 R`).join(' ')}] /Count ${pages} >>`,
  ];
  for (let i = 0; i < pages; i++)
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>`);
  if (bytes) {
    // Valid, individually bounded auxiliary streams exercise file-size and
    // total-decoding limits without pretending this is a real-world scan corpus.
    for (let i = 0; i < 98; i++)
      objects.push(
        Buffer.concat([
          Buffer.from('<< /Length 1048576 >>\nstream\n'),
          Buffer.alloc(1024 * 1024, 32),
          Buffer.from('\nendstream'),
        ]),
      );
    const prefix = '<< /Length ';
    objects.push('<< /Length 0 >>\nstream\n\nendstream');
    let padding = bytes - rawPdf(objects).length;
    for (let i = 0; i < 4; i++) {
      if (padding < 0) throw new Error('Boundary fixture exceeded its target size.');
      objects[objects.length - 1] = Buffer.concat([
        Buffer.from(`${prefix}${padding} >>\nstream\n`),
        Buffer.alloc(padding, 32),
        Buffer.from('\nendstream'),
      ]);
      const output = rawPdf(objects);
      if (output.length === bytes) return output;
      padding += bytes - output.length;
    }
    throw new Error('Boundary fixture size did not converge.');
  }
  return rawPdf(objects);
}
