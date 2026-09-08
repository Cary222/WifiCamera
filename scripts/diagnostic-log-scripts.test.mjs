/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const node = process.execPath;

test('stream script filters stdin to WifiCamera diagnostic records', () => {
  const result = spawnSync(node, ['scripts/stream-diagnostic-logs.mjs', '--filter-stdin'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    input: [
      '09-04 ReactNativeJS: random message',
      '09-04 ReactNativeJS: [WIFICAMERA_DIAGNOSTIC][ERROR][WS] connection failed',
      '09-04 ActivityManager: unrelated',
    ].join('\n'),
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '09-04 ReactNativeJS: [WIFICAMERA_DIAGNOSTIC][ERROR][WS] connection failed');
});

test('pull script builds a shell-free adb command for the selected device', () => {
  const result = spawnSync(node, ['scripts/pull-diagnostic-logs.mjs', '--print-command', '127.0.0.1:16384'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    '-s',
    '127.0.0.1:16384',
    'exec-out',
    'run-as',
    'com.wificamera.development',
    'cat',
    'files/diagnostics/connection-errors.log',
  ]);
});
