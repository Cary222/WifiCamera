#!/usr/bin/env node
/**
 * One-off check: confirms android/app/src/main/assets/stellar mirrors
 * src/assets/stellar after the sync script has run.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'src', 'assets', 'stellar');
const target = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'stellar');

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory())
      files.push(...walk(full));
    else if (entry.isFile())
      files.push(full);
  }
  return files;
}

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const normalize = buffer => Buffer.from(buffer.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');

const sources = walk(source);
let identical = 0;
let lineEndingOnly = 0;
const drifted = [];
for (const from of sources) {
  const to = path.join(target, path.relative(source, from));
  const a = readFileSync(from);
  const b = readFileSync(to);
  if (sha256(a) === sha256(b))
    identical += 1;
  else if (sha256(normalize(a)) === sha256(normalize(b)))
    lineEndingOnly += 1;
  else
    drifted.push(path.relative(root, to));
}

console.log(`files compared: ${sources.length}`);
console.log(`byte-identical: ${identical}`);
console.log(`line-ending-only difference: ${lineEndingOnly}`);
if (drifted.length > 0) {
  console.error('content drift detected:');
  for (const file of drifted)
    console.error(`  ${file}`);
  process.exit(1);
}
console.log('sync verified: android assets mirror src/assets/stellar.');
