/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, gzipSync } from 'node:zlib';
import { openApkZip } from './verify-embedded-apk.mjs';

const verifier = fileURLToPath(new URL('./verify-embedded-apk.mjs', import.meta.url));
const digest = data => createHash('sha256').update(data).digest('hex');

// Small real ZIP archives, not mocked listings: central/local headers + payloads.
export function makeApk(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, value, method = 8] of entries) {
    const filename = Buffer.from(name);
    const bytes = Buffer.from(value);
    const data = method === 8 ? deflateRawSync(bytes) : bytes;
    let crc = 0xFFFFFFFF;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
    }
    crc = (crc ^ 0xFFFFFFFF) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034B50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, data);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014B50);
    directory.writeUInt16LE(20, 4);
    header.copy(directory, 6, 4, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, filename);
    offset += header.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'APK 核验 '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'src/assets/stellar'), { recursive: true });
  mkdirSync(path.join(root, 'android/app/src/main/assets'), { recursive: true });
  writeFileSync(path.join(root, 'src/assets/stellar/index.html'), 'current scene');
  writeFileSync(path.join(root, 'src/assets/stellar/engine.wasm'), Buffer.from([0, 1, 2, 3]));
  writeFileSync(path.join(root, 'android/app/src/main/assets/index.android.bundle'), 'current bundle');
  return root;
}

export const validEntries = [
  ['AndroidManifest.xml', 'manifest', 0],
  ['assets/index.android.bundle', 'current bundle'],
  ['assets/stellar/index.html', 'current scene', 0],
  ['assets/stellar/engine.wasm', Buffer.from([0, 1, 2, 3])],
];

function verify(root, data, args = []) {
  if (data)
    writeFileSync(path.join(root, '调试 包.apk'), data);
  return spawnSync(process.execPath, [verifier, '--root', root, '--apk', path.join(root, '调试 包.apk'), ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
  });
}

test('verifies stored and deflated APK contents and writes actual SHA-256 receipt', (t) => {
  assert.ok(existsSync(verifier), 'APK content verifier must exist');
  const root = fixture(t);
  const apk = makeApk(validEntries);
  const receipt = path.join(root, 'receipt.json');
  const result = verify(root, apk, ['--receipt', receipt]);
  assert.equal(result.status, 0, result.stderr);
  const info = JSON.parse(readFileSync(receipt, 'utf8'));
  assert.equal(info.bundleSha256, digest('current bundle'));
  assert.equal(info.stellarIndexSha256, digest('current scene'));
  assert.equal(info.apkSha256, digest(apk));
  assert.equal(info.stellarFileCount, 2);
});

test('verifies gzip assets unpacked and renamed by the Android asset merger', (t) => {
  const root = fixture(t);
  const content = 'real satellite records\n';
  writeFileSync(path.join(root, 'src/assets/stellar/satellites.jsonl.gz'), gzipSync(content));
  const receipt = path.join(root, 'receipt.json');
  const result = verify(root, makeApk([...validEntries, ['assets/stellar/satellites.jsonl', content]]), ['--receipt', receipt]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(receipt, 'utf8')).stellarFileCount, 3);
});

test('still rejects changed bytes in an unpacked gzip asset', (t) => {
  const root = fixture(t);
  writeFileSync(path.join(root, 'src/assets/stellar/satellites.jsonl.gz'), gzipSync('original records'));
  const receipt = path.join(root, 'receipt.json');
  const result = verify(root, makeApk([...validEntries, ['assets/stellar/satellites.jsonl', 'modified records']]), ['--receipt', receipt]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SHA-256 mismatch: assets\/stellar\/satellites\.jsonl/);
  assert.equal(existsSync(receipt), false);
});

test('rejects source names that collide after Android gzip expansion', (t) => {
  const root = fixture(t);
  writeFileSync(path.join(root, 'src/assets/stellar/satellites.jsonl.gz'), gzipSync('original records'));
  writeFileSync(path.join(root, 'src/assets/stellar/satellites.jsonl'), 'different records');
  const result = verify(root, makeApk([...validEntries, ['assets/stellar/satellites.jsonl', 'different records']]));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /collision.*satellites\.jsonl/i);
});

for (const [name, entries, pattern] of [
  ['missing bundle', validEntries.filter(([name]) => name !== 'assets/index.android.bundle'), /index\.android\.bundle/],
  ['old bundle', validEntries.map(entry => entry[0] === 'assets/index.android.bundle' ? [entry[0], 'old bundle'] : entry), /index\.android\.bundle/],
  ['old scene', validEntries.map(entry => entry[0] === 'assets/stellar/index.html' ? [entry[0], 'old scene'] : entry), /index\.html/],
  ['missing runtime', validEntries.filter(([name]) => !name.endsWith('.wasm')), /engine\.wasm/],
  ['unexpected stellar file', [...validEntries, ['assets/stellar/extra.dat', 'extra']], /extra\.dat/],
  ['duplicate ZIP name', [...validEntries, validEntries[1]], /duplicate/i],
  ['ZIP traversal', [...validEntries, ['assets/stellar/../escape', 'outside']], /unsafe|invalid/i],
]) {
  test(`rejects ${name} and does not issue a success receipt`, (t) => {
    assert.ok(existsSync(verifier), 'APK content verifier must exist');
    const root = fixture(t);
    const receipt = path.join(root, 'receipt.json');
    const result = verify(root, makeApk(entries), ['--receipt', receipt]);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, pattern);
    assert.equal(existsSync(receipt), false);
  });
}

for (const [name, data] of [['no APK', undefined], ['truncated APK', Buffer.from('PK')], ['not ZIP', Buffer.alloc(40)]]) {
  test(`rejects ${name} with a real failing exit code`, (t) => {
    assert.ok(existsSync(verifier), 'APK content verifier must exist');
    const result = verify(fixture(t), data);
    assert.equal(result.status, 1, result.stderr);
  });
}

test('reads catalog ZIP entries with CRC verification and explicit close', (t) => {
  const root = fixture(t);
  const file = path.join(root, 'catalog.apk');
  writeFileSync(file, makeApk([['one.eph', 'star bytes', 0], ['two.eph', 'dso bytes']]));
  const zip = openApkZip(file);
  try {
    assert.deepEqual([...zip.entries.keys()], ['one.eph', 'two.eph']);
    assert.equal(zip.read('one.eph').toString(), 'star bytes');
    assert.equal(zip.read('two.eph').toString(), 'dso bytes');
    assert.throws(() => zip.read('missing.eph'), /missing/i);
  }
  finally { zip.close(); }
  assert.throws(() => zip.read('one.eph'), /closed/i);
});

test('rejects corrupted stored ZIP data even when sizes still match', (t) => {
  const root = fixture(t);
  const file = path.join(root, 'corrupt.apk');
  const bytes = makeApk([['one.eph', 'star bytes', 0]]);
  bytes[30 + 'one.eph'.length] ^= 1;
  writeFileSync(file, bytes);
  const zip = openApkZip(file);
  try {
    assert.throws(() => zip.read('one.eph'), /CRC/i);
  }
  finally {
    zip.close();
  }
});
