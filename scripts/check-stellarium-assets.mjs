import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('src/assets/stellar');
const required = [
  'index.html',
  'stellarium-web-engine.js',
  'stellarium-web-engine.wasm',
  'fonts/Roboto-Regular.ttf',
  'fonts/Roboto-Bold.ttf',
  'fonts/NotoSansSC-Subset.ttf',
  'data/stars/properties',
  'data/dso/properties',
  'data/skycultures/western/index.json',
  'data/meteor-showers.json',
  'data/landscapes/guereins/Norder2/Dir0/Npix0.webp',
  'landscapes.json',
  'data/landscapes/winterfield/properties',
  'data/landscapes/champagne_castle/properties',
  'data/landscapes/kloppenheim/properties',
  'data/landscapes/garching/properties',
  'data/landscapes/ocean/properties',
];
const missing = [];
for (const relativePath of required) {
  try {
    const file = await stat(path.join(root, relativePath));
    if (!file.isFile() || file.size === 0)
      missing.push(relativePath);
  }
  catch { missing.push(relativePath); }
}
if (missing.length)
  throw new Error(`Incomplete Stellarium runtime: ${missing.join(', ')}`);

// The bundled engine uses stb_truetype/NanoVG. It cannot safely load a CFF
// OpenType font even if the file is named `.ttf`: doing so crashes WASM during
// `core_add_font` and prevents skyculture data from finishing its activation.
const cjkFont = await readFile(path.join(root, 'fonts/NotoSansSC-Subset.ttf'));
const tableCount = cjkFont.readUInt16BE(4);
const tableTags = Array.from(
  { length: tableCount },
  (_, index) => cjkFont.subarray(12 + index * 16, 16 + index * 16).toString('ascii'),
);
if (!tableTags.includes('glyf') || tableTags.includes('CFF '))
  throw new Error('Stellarium CJK font must use TrueType glyf outlines, not CFF OpenType outlines.');

console.log(`Stellarium runtime verified (${required.length} required files).`);
