#!/usr/bin/env node
/** Read the APK itself (ZIP STORE/DEFLATE), without extraction or new dependencies. */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { closeSync, createReadStream, fstatSync, openSync, readFileSync, readSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { crc32, createInflateRaw, gunzipSync, inflateRawSync } from 'node:zlib';

import { differingFiles, projectRoot, sha256, snapshotTree, stellarPaths, treeDigest, writeJsonAtomic } from './sync-stellar-assets.mjs';

export function embeddedSnapshot(root) {
  const stellar = snapshotTree(stellarPaths(root).source);
  const bundle = readFileSync(path.join(root, 'android/app/src/main/assets/index.android.bundle'));
  if (!bundle.length || !stellar['index.html']?.size)
    throw new Error('Missing or empty bundle / stellar/index.html');
  const expected = {
    'assets/index.android.bundle': { sha256: sha256(bundle), size: bundle.length },
  };
  for (const [name, info] of Object.entries(stellar)) {
    // Android's asset merger expands .gz files and removes that suffix. Verify
    // the actual packaged bytes, not a filename that cannot survive the merge.
    const packagedName = `assets/stellar/${name.endsWith('.gz') ? name.slice(0, -3) : name}`;
    if (Object.hasOwn(expected, packagedName))
      throw new Error(`Android asset name collision: ${packagedName}`);
    if (name.endsWith('.gz')) {
      const bytes = gunzipSync(readFileSync(path.join(stellarPaths(root).source, name)), { maxOutputLength: 64 * 1024 * 1024 });
      expected[packagedName] = { sha256: sha256(bytes), size: bytes.length };
    }
    else {
      expected[packagedName] = info;
    }
  }
  return expected;
}

function readSpan(fd, offset, size) {
  const bytes = Buffer.alloc(size);
  if (readSync(fd, bytes, 0, size, offset) !== size)
    throw new Error('Truncated APK ZIP');
  return bytes;
}

function directoryInfo(fd) {
  const size = fstatSync(fd).size;
  const end = readSpan(fd, Math.max(0, size - 65557), Math.min(size, 65557));
  for (let offset = end.length - 22; offset >= 0; offset--) {
    if (end.readUInt32LE(offset) !== 0x06054B50 || offset + 22 + end.readUInt16LE(offset + 20) !== end.length)
      continue;
    const count = end.readUInt16LE(offset + 10);
    const length = end.readUInt32LE(offset + 12);
    const start = end.readUInt32LE(offset + 16);
    if (end.readUInt16LE(offset + 4) || end.readUInt16LE(offset + 6)
      || end.readUInt16LE(offset + 8) !== count || count === 0xFFFF
      || length > 32 * 1024 * 1024 || start + length !== size - end.length + offset) {
      throw new Error('Unsupported ZIP64 / multi-disk or invalid APK directory');
    }
    return { count, start, bytes: readSpan(fd, start, length) };
  }
  throw new Error('APK is not a complete ZIP archive');
}

function zipEntries(fd) {
  const directory = directoryInfo(fd);
  const entries = new Map();
  let offset = 0;
  for (let index = 0; index < directory.count; index++) {
    const bytes = directory.bytes;
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014B50)
      throw new Error('Invalid APK central directory');
    const nameLength = bytes.readUInt16LE(offset + 28);
    const next = offset + 46 + nameLength + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
    if (next > bytes.length)
      throw new Error('Truncated APK directory entry');
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (!name || /[\\:\0]/.test(name) || name.startsWith('/') || name.split('/').some(part => part === '..' || part === '.'))
      throw new Error(`Unsafe ZIP entry: ${name}`);
    if (entries.has(name))
      throw new Error(`Duplicate ZIP entry: ${name}`);
    entries.set(name, {
      name,
      flags: bytes.readUInt16LE(offset + 8),
      method: bytes.readUInt16LE(offset + 10),
      crc32: bytes.readUInt32LE(offset + 16),
      compressedSize: bytes.readUInt32LE(offset + 20),
      size: bytes.readUInt32LE(offset + 24),
      offset: bytes.readUInt32LE(offset + 42),
      directoryStart: directory.start,
    });
    offset = next;
  }
  if (offset !== directory.bytes.length)
    throw new Error('Invalid APK directory length');
  return entries;
}

async function streamDigest(streams, expectedSize) {
  const hash = createHash('sha256');
  let size = 0;
  const sink = new Writable({
    write(bytes, _encoding, callback) {
      size += bytes.length;
      if (size > expectedSize)
        return callback(new Error('APK entry exceeds expected size'));
      hash.update(bytes);
      callback();
    },
  });
  await pipeline(...streams, sink);
  if (size !== expectedSize)
    throw new Error('APK entry size mismatch');
  return hash.digest('hex');
}

async function entryDigest(fd, apk, entry) {
  const header = readSpan(fd, entry.offset, 30);
  if (header.readUInt32LE(0) !== 0x04034B50 || header.readUInt16LE(6) !== entry.flags
    || header.readUInt16LE(8) !== entry.method || entry.flags & 1 || ![0, 8].includes(entry.method)) {
    throw new Error(`Unsupported / inconsistent ZIP entry: ${entry.name}`);
  }
  const nameLength = header.readUInt16LE(26);
  if (readSpan(fd, entry.offset + 30, nameLength).toString('utf8') !== entry.name)
    throw new Error(`ZIP local name mismatch: ${entry.name}`);
  const start = entry.offset + 30 + nameLength + header.readUInt16LE(28);
  if (start + entry.compressedSize > entry.directoryStart)
    throw new Error(`ZIP payload out of bounds: ${entry.name}`);
  if (!entry.compressedSize) {
    if (entry.size)
      throw new Error(`Truncated ZIP payload: ${entry.name}`);
    return sha256(Buffer.alloc(0));
  }
  const streams = [createReadStream(apk, { start, end: start + entry.compressedSize - 1 })];
  if (entry.method === 8)
    streams.push(createInflateRaw());
  return streamDigest(streams, entry.size);
}

export function openApkZip(apk) {
  const fd = openSync(apk, 'r');
  let closed = false;
  let entries;
  try {
    entries = zipEntries(fd);
  }
  catch (error) {
    closeSync(fd);
    throw error;
  }
  return {
    entries,
    read(name) {
      if (closed)
        throw new Error('APK ZIP is closed');
      const entry = entries.get(name);
      if (!entry)
        throw new Error(`Missing APK entry: ${name}`);
      if (entry.size > 64 * 1024 * 1024 || entry.compressedSize > 64 * 1024 * 1024)
        throw new Error(`APK entry size limit: ${name}`);
      const header = readSpan(fd, entry.offset, 30);
      if (header.readUInt32LE(0) !== 0x04034B50 || header.readUInt16LE(6) !== entry.flags
        || header.readUInt16LE(8) !== entry.method || entry.flags & 1 || ![0, 8].includes(entry.method)) {
        throw new Error(`Unsupported / inconsistent ZIP entry: ${name}`);
      }
      const nameLength = header.readUInt16LE(26);
      if (readSpan(fd, entry.offset + 30, nameLength).toString('utf8') !== name)
        throw new Error(`ZIP local name mismatch: ${name}`);
      const start = entry.offset + 30 + nameLength + header.readUInt16LE(28);
      if (start + entry.compressedSize > entry.directoryStart)
        throw new Error(`ZIP payload out of bounds: ${name}`);
      const compressed = readSpan(fd, start, entry.compressedSize);
      let bytes = compressed;
      if (entry.method === 8) {
        const inflated = inflateRawSync(compressed, { maxOutputLength: Math.max(1, entry.size), info: true });
        if (inflated.engine.bytesWritten !== compressed.length)
          throw new Error(`Trailing ZIP data: ${name}`);
        bytes = inflated.buffer;
      }
      if (bytes.length !== entry.size)
        throw new Error(`ZIP size mismatch: ${name}`);
      if (crc32(bytes) !== entry.crc32)
        throw new Error(`ZIP CRC mismatch: ${name}`);
      return bytes;
    },
    close() {
      if (!closed) {
        closed = true;
        closeSync(fd);
      }
    },
  };
}

export async function verifyEmbeddedApk({ root, apk, expected = embeddedSnapshot(root), receipt }) {
  if (differingFiles(expected, embeddedSnapshot(root)).length)
    throw new Error('Build inputs changed since the pre-Gradle snapshot');
  const fd = openSync(apk, 'r');
  try {
    const entries = zipEntries(fd);
    for (const name of entries.keys()) {
      if (name.startsWith('assets/stellar/') && !name.endsWith('/') && !expected[name])
        throw new Error(`Unexpected packaged stellar asset: ${name}`);
    }
    for (const [name, info] of Object.entries(expected)) {
      const entry = entries.get(name);
      if (!entry || entry.size !== info.size || await entryDigest(fd, apk, entry) !== info.sha256)
        throw new Error(`APK content missing / SHA-256 mismatch: ${name}`);
    }
    const apkSha256 = await streamDigest([createReadStream(apk)], fstatSync(fd).size);
    if (differingFiles(expected, embeddedSnapshot(root)).length)
      throw new Error('Build inputs changed during APK verification');
    const stellar = Object.fromEntries(Object.entries(expected).filter(([name]) => name.startsWith('assets/stellar/')));
    const result = {
      version: 1,
      apk: path.resolve(apk),
      apkSha256,
      bundleSha256: expected['assets/index.android.bundle'].sha256,
      stellarIndexSha256: expected['assets/stellar/index.html'].sha256,
      stellarTreeSha256: treeDigest(stellar),
      stellarFileCount: Object.keys(stellar).length,
    };
    if (receipt)
      writeJsonAtomic(receipt, result);
    return result;
  }
  finally {
    closeSync(fd);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      root: { type: 'string' },
      apk: { type: 'string' },
      expected: { type: 'string' },
      receipt: { type: 'string' },
    } });
    if (!values.apk)
      throw new Error('--apk <actual APK file> is required');
    const result = await verifyEmbeddedApk({
      root: path.resolve(values.root ?? projectRoot),
      apk: path.resolve(values.apk),
      expected: values.expected ? JSON.parse(readFileSync(values.expected, 'utf8')) : undefined,
      receipt: values.receipt,
    });
    console.log(`[verify-apk] ${JSON.stringify(result)}`);
  }
  catch (error) {
    console.error(`[verify-apk] ${error.message}`);
    process.exitCode = 1;
  }
}
