#!/usr/bin/env node
/**
 * Syncs src/assets/stellar/** into android/app/src/main/assets/stellar/**.
 *
 * The Stellarium scene (index.html + engine + data) ships as native Android
 * assets, so JavaScript hot-reload never updates it. This script mirrors the
 * canonical copy so a Gradle build always packages the current source.
 *
 * A target file is considered identical when its bytes match the source, or
 * when its bytes match after CRLF/LF normalization (git autocrlf routinely
 * rewrites line endings). Anything else is a real content drift and blocks
 * the sync; resolve it by editing the canonical src/assets/stellar copy, then
 * re-run.
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'src', 'assets', 'stellar');
const target = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'stellar');

if (!existsSync(source)) {
  console.error(`[sync-stellar] Source directory not found: ${source}`);
  process.exit(1);
}
if (!existsSync(path.join(root, 'android'))) {
  console.log('[sync-stellar] No android/ directory, skipping.');
  process.exit(0);
}

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

function normalizeText(buffer) {
  return Buffer.from(buffer.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
}

/**
 * Two files are equivalent when their bytes match, or when their bytes match
 * after CRLF/LF normalization (git autocrlf routinely rewrites line endings).
 */
function isEquivalent(from, to) {
  const a = readFileSync(from);
  const b = readFileSync(to);
  if (sha256(a) === sha256(b))
    return true;
  if (a.includes(10) && !a.includes(0)) // looks like text
    return sha256(normalizeText(a)) === sha256(normalizeText(b));
  return false;
}

/**
 * JSON files whose parsed values are equal differ only in formatting (git
 * autocrlf churns line endings and trailing newlines). Treat them as
 * equivalent but report them so formatting drift is visible instead of
 * silently ignored.
 */
function isJsonFormatDrift(from, to) {
  if (!from.endsWith('.json'))
    return false;
  try {
    return JSON.stringify(JSON.parse(normalizeText(readFileSync(from)).toString('utf8')))
      === JSON.stringify(JSON.parse(normalizeText(readFileSync(to)).toString('utf8')));
  }
  catch {
    return false;
  }
}

const force = process.argv.includes('--force');

const sources = walk(source);
const conflicts = [];
const formatDrift = [];
for (const from of sources) {
  const to = path.join(target, path.relative(source, from));
  if (!existsSync(to))
    continue;
  if (isEquivalent(from, to))
    continue;
  if (isJsonFormatDrift(from, to))
    formatDrift.push(path.relative(root, to));
  else
    conflicts.push(path.relative(root, to));
}

if (conflicts.length > 0 && force) {
  console.warn('[sync-stellar] --force: overwriting files whose content differs from the source:');
  for (const file of conflicts)
    console.warn(`  ${file}`);
  conflicts.length = 0;
}

if (conflicts.length > 0) {
  console.error('[sync-stellar] Refusing to overwrite files whose content differs from the source:');
  for (const file of conflicts)
    console.error(`  ${file}`);
  console.error('[sync-stellar] The android copy has drifted from src/assets/stellar.');
  console.error('[sync-stellar] Make the canonical edit in src/assets/stellar, then re-run.');
  process.exit(1);
}

if (formatDrift.length > 0) {
  console.warn('[sync-stellar] JSON formatting drift (parsed values equal, will be overwritten):');
  for (const file of formatDrift)
    console.warn(`  ${file}`);
}

// Remove entries that no longer exist in the canonical copy.
if (existsSync(target)) {
  for (const stale of walk(target)) {
    const canonical = path.join(source, path.relative(target, stale));
    if (!existsSync(canonical)) {
      rmSync(stale);
      console.log(`[sync-stellar] Removed stale file: ${path.relative(root, stale)}`);
    }
  }
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log(`[sync-stellar] Synced ${sources.length} files from src/assets/stellar to android/app/src/main/assets/stellar.`);
