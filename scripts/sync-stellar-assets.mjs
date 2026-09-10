#!/usr/bin/env node
/** Exact-byte, three-way sync. The baseline lives outside packaged assets. */
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sha256 = value => createHash('sha256').update(value).digest('hex');

export function stellarPaths(root) {
  return {
    source: path.join(root, 'src/assets/stellar'),
    target: path.join(root, 'android/app/src/main/assets/stellar'),
    manifest: path.join(root, 'android/.stellar-sync-manifest.json'),
  };
}

export function snapshotTree(directory, relative = '') {
  const files = Object.create(null);
  const current = path.join(directory, relative);
  if (lstatSync(current).isSymbolicLink())
    throw new Error(`Symbolic links are not supported: ${current}`);
  for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      Object.assign(files, snapshotTree(directory, name));
    }
    else if (entry.isFile()) {
      const bytes = readFileSync(path.join(directory, name));
      files[name] = { sha256: sha256(bytes), size: bytes.length };
    }
    else {
      throw new Error(`Unsupported asset entry: ${name}`);
    }
  }
  return files;
}

export function treeDigest(files) {
  return sha256(JSON.stringify(Object.keys(files).sort().map(name => [name, files[name].sha256, files[name].size])));
}

export function differingFiles(a, b) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().filter(name => a[name]?.sha256 !== b[name]?.sha256 || a[name]?.size !== b[name]?.size);
}

function readManifest(file) {
  if (!existsSync(file))
    return Object.create(null);
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (value.version !== 1 || !value.files || Array.isArray(value.files))
      throw new Error('Unsupported schema');
    for (const [name, info] of Object.entries(value.files)) {
      if (!name || /[\\:]/.test(name) || name.split('/').some(part => !part || part === '.' || part === '..')
        || !/^[a-f0-9]{64}$/.test(info?.sha256) || !Number.isSafeInteger(info?.size) || info.size < 0) {
        throw new Error(`Invalid entry: ${name}`);
      }
    }
    if (value.treeSha256 !== treeDigest(value.files))
      throw new Error('Invalid tree digest');
    return value.files;
  }
  catch (error) {
    throw new Error(`Invalid sync manifest ${file}: ${error.message}`);
  }
}

export function inspectSync(root) {
  const paths = stellarPaths(root);
  const sources = snapshotTree(paths.source);
  if (Object.keys(sources).length === 0)
    throw new Error(`Empty stellar source: ${paths.source}`);
  const targets = existsSync(paths.target) ? snapshotTree(paths.target) : Object.create(null);
  const previous = readManifest(paths.manifest);
  const conflicts = differingFiles(sources, targets).filter((name) => {
    if (!targets[name] && !previous[name])
      return false;
    return !targets[name] || !previous[name] || targets[name].sha256 !== previous[name].sha256;
  });
  return { paths, sources, targets, conflicts };
}

export function writeJsonAtomic(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    renameSync(temporary, file);
  }
  finally {
    rmSync(temporary, { force: true });
  }
}

function pruneEmptyDirectories(directory) {
  if (!existsSync(directory))
    return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory())
      continue;
    const child = path.join(directory, entry.name);
    pruneEmptyDirectories(child);
    if (!readdirSync(child).length)
      rmdirSync(child);
  }
}

export function syncStellar(root, { force = false, check = false } = {}) {
  const state = inspectSync(root);
  if (!existsSync(path.join(root, 'android')))
    return { ...state, skipped: true };
  const { paths, sources, targets, conflicts } = state;
  if (conflicts.length > 0) {
    const message = `Independent target changes / no matching sync baseline:\n${conflicts.map(name => `  ${name}`).join('\n')}`;
    if (!force || check)
      throw new Error(`${message}\nResolve the conflict explicitly; --force overwrites target changes.`);
    console.warn(`[sync-stellar] --force: ${message}`);
  }
  if (check)
    return state;
  for (const name of Object.keys(targets)) {
    if (!sources[name])
      rmSync(path.join(paths.target, name));
  }
  pruneEmptyDirectories(paths.target);
  for (const name of differingFiles(sources, targets)) {
    if (!sources[name])
      continue;
    const destination = path.join(paths.target, name);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(path.join(paths.source, name), destination);
  }
  // Never advance the baseline after a partial copy or concurrent source edit.
  if (differingFiles(sources, snapshotTree(paths.source)).length
    || differingFiles(sources, snapshotTree(paths.target)).length) {
    throw new Error('Assets changed during sync; baseline was not advanced.');
  }
  writeJsonAtomic(paths.manifest, { version: 1, treeSha256: treeDigest(sources), files: sources });
  return state;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { root: { type: 'string' }, force: { type: 'boolean' }, check: { type: 'boolean' } } });
    const result = syncStellar(path.resolve(values.root ?? projectRoot), values);
    if (result.skipped)
      console.log('[sync-stellar] No android/ directory, skipping until native generation.');
    else
      console.log(`[sync-stellar] ${values.check ? 'Safe to sync' : 'Synced'}: ${Object.keys(result.sources).length} files.`);
  }
  catch (error) {
    console.error(`[sync-stellar] ${error.message}`);
    process.exitCode = 1;
  }
}
