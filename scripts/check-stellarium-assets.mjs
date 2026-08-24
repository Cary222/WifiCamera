import { stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('src/assets/stellar');
const required = [
  'index.html',
  'stellarium-web-engine.js',
  'stellarium-web-engine.wasm',
  'fonts/Roboto-Regular.ttf',
  'fonts/Roboto-Bold.ttf',
  'data/stars/properties',
  'data/dso/properties',
  'data/skycultures/western/index.json',
  'data/meteor-showers.json',
  'data/landscapes/guereins/Norder2/Dir0/Npix0.webp',
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
console.log(`Stellarium runtime verified (${required.length} required files).`);
