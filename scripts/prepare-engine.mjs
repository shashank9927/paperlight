import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Keep QPDF's own WASM memory.grow instruction subject to a hard maximum.
// Changing the memory declaration also bounds allocations made inside C++.
const bytes = readFileSync('node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
const expected = 'abd933f4ccace4f732999381b21aec8b7e3726f18a5b167fafd57f88dd440876';
if (createHash('sha256').update(bytes).digest('hex') !== expected)
  throw new Error('QPDF WASM changed: review the memory adapter before upgrading.');
let pos = 8;
const leb = () => {
  let value = 0,
    shift = 0,
    byte;
  do {
    byte = bytes[pos++];
    value += (byte & 127) * 2 ** shift;
    shift += 7;
  } while (byte & 128);
  return value;
};
let patched = false;
while (pos < bytes.length) {
  const id = bytes[pos++],
    length = leb(),
    end = pos + length;
  if (id === 5) {
    if (leb() !== 1 || leb() !== 1) throw new Error('Unexpected WASM memory declaration.');
    const minimum = leb(),
      offset = pos,
      maximum = leb();
    const pages = (512 * 1024 * 1024) / 65536;
    if (minimum > pages || maximum < pages) throw new Error('Unexpected WASM memory range.');
    let value = pages;
    for (let i = offset; i < pos; i++) {
      bytes[i] = (value & 127) | (i < pos - 1 ? 128 : 0);
      value = Math.floor(value / 128);
    }
    if (value) throw new Error('Memory limit encoding failed.');
    patched = true;
  }
  pos = end;
}
if (!patched || !WebAssembly.validate(bytes)) throw new Error('Bounded WASM validation failed.');
mkdirSync('src/generated', { recursive: true });
writeFileSync('src/generated/qpdf.wasm', bytes);
console.log('Prepared QPDF 12.2.0 with a 512 MiB WASM memory maximum.');
