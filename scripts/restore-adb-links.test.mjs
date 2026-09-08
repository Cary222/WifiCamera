/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';

const moduleUrl = new URL('./restore-adb-links.mjs', import.meta.url).href;
const recovery = await import(moduleUrl);

function deviceFixture() {
  const state = {
    devices: 'List of devices attached\ne2621126569ad4a5 device\nemulator-5554 device\nemulator-5570 offline\n',
    forwards: [],
    reverses: [],
    commands: [],
    failWrites: false,
  };
  const adb = async (args) => {
    state.commands.push(args);
    const command = args.join(' ');
    if (command === 'devices -l')
      return { ok: true, out: state.devices };
    if (command === 'forward --list')
      return { ok: true, out: state.forwards.map(row => row.join(' ')).join('\n') };
    if (command.endsWith('reverse --list'))
      return { ok: true, out: state.reverses.map(row => row.join(' ')).join('\n') };
    if (args[3] === '--no-rebind') {
      if (state.failWrites)
        return { ok: false, out: 'device went offline' };
      const rules = args[2] === 'forward' ? state.forwards : state.reverses;
      rules.push([args[2] === 'forward' ? args[1] : 'UsbFfs', args[4], args[5]]);
      return { ok: true, out: '' };
    }
    throw new Error(`Unexpected ADB operation: ${command}`);
  };
  return { state, adb, probe: async () => ({ alive: true, detail: 'healthy' }) };
}

function writes(state) {
  return state.commands.filter(args => args.includes('--no-rebind'));
}

test('repairs missing mappings, leaves good ones untouched, and repairs a later loss', async () => {
  const fixture = deviceFixture();
  const first = await recovery.restoreLinks(fixture);
  assert.equal(first.healthy, true);
  assert.deepEqual(writes(fixture.state), [
    ['-s', 'e2621126569ad4a5', 'forward', '--no-rebind', 'tcp:18999', 'tcp:8999'],
    ['-s', 'e2621126569ad4a5', 'forward', '--no-rebind', 'tcp:18889', 'tcp:8889'],
    ['-s', 'e2621126569ad4a5', 'forward', '--no-rebind', 'tcp:18190', 'tcp:18190'],
    ['-s', 'emulator-5554', 'reverse', '--no-rebind', 'tcp:8081', 'tcp:8081'],
  ]);
  fixture.state.commands = [];
  assert.equal((await recovery.restoreLinks(fixture)).healthy, true);
  assert.deepEqual(writes(fixture.state), []);
  fixture.state.forwards = fixture.state.forwards.filter(row => row[1] !== 'tcp:18999');
  fixture.state.commands = [];
  assert.equal((await recovery.restoreLinks(fixture)).healthy, true);
  assert.deepEqual(writes(fixture.state), [
    ['-s', 'e2621126569ad4a5', 'forward', '--no-rebind', 'tcp:18999', 'tcp:8999'],
  ]);
});

test('check mode reports missing rules without changing anything', async () => {
  const fixture = deviceFixture();
  const result = await recovery.restoreLinks({ ...fixture, checkOnly: true });
  assert.equal(result.healthy, false);
  assert.ok(result.issues.some(issue => issue.includes('18999')));
  assert.deepEqual(writes(fixture.state), []);
});

test('never mistakes a second emulator or an unrelated phone for the camera board', async () => {
  const fixture = deviceFixture();
  fixture.state.devices = 'List of devices attached\nphone-123 device\nemulator-5554 device\nemulator-5564 device\n';
  const result = await recovery.restoreLinks(fixture);
  assert.equal(result.healthy, false);
  assert.equal(result.board, undefined);
  assert.equal(result.emulator, undefined);
  assert.deepEqual(writes(fixture.state), []);
});

test('supports an explicitly selected TCP emulator without probing Android properties on the board', async () => {
  const fixture = deviceFixture();
  fixture.state.devices = 'List of devices attached\ne2621126569ad4a5 device\n127.0.0.1:16384 device\n';
  const result = await recovery.restoreLinks({ ...fixture, emulatorSerial: '127.0.0.1:16384' });
  assert.equal(result.healthy, true);
  assert.equal(result.emulator, '127.0.0.1:16384');
});

test('does not replace a forwarding port owned by a different device', async () => {
  const fixture = deviceFixture();
  fixture.state.forwards.push(['phone-123', 'tcp:18999', 'tcp:8999']);
  const result = await recovery.restoreLinks(fixture);
  assert.equal(result.healthy, false);
  assert.ok(result.issues.some(issue => issue.includes('18999')));
  assert.equal(writes(fixture.state).some(args => args[4] === 'tcp:18999'), false);
  assert.deepEqual(fixture.state.forwards[0], ['phone-123', 'tcp:18999', 'tcp:8999']);
});

test('reports a failed repair even if health endpoints are otherwise reachable', async () => {
  const fixture = deviceFixture();
  fixture.state.failWrites = true;
  const result = await recovery.restoreLinks(fixture);
  assert.equal(result.healthy, false);
  assert.ok(result.issues.some(issue => issue.includes('offline')));
});

test('checks Metro independently from the camera and relay endpoints', async () => {
  const fixture = deviceFixture();
  const probes = [];
  const result = await recovery.restoreLinks({
    ...fixture,
    probe: async (port) => {
      probes.push(port);
      return { alive: port !== 8081, detail: 'test' };
    },
  });
  assert.equal(result.healthy, false);
  assert.deepEqual(probes.sort((a, b) => a - b), [8081, 18787, 18999]);
  assert.ok(result.issues.some(issue => issue.includes('8081')));
});

test('watch mode survives errors, backs off, and resets delay after recovery', async () => {
  const controller = new AbortController();
  const delays = [];
  const reports = [];
  let attempts = 0;
  let running = false;
  await recovery.watchLinks({
    signal: controller.signal,
    run: async () => {
      assert.equal(running, false, 'recovery iterations must never overlap');
      running = true;
      await Promise.resolve();
      running = false;
      attempts++;
      if (attempts === 1)
        throw new Error('ADB restarting');
      if (attempts === 6)
        controller.abort();
      return { healthy: attempts === 5, issues: [], repaired: [] };
    },
    sleep: async (ms) => { delays.push(ms); },
    report: result => reports.push(result),
  });
  assert.equal(attempts, 6);
  assert.deepEqual(delays, [5000, 10000, 20000, 30000, 5000]);
  assert.ok(reports.some(result => result.healthy));
  assert.ok(reports.some(result => result.issues.includes('ADB restarting')));
});

test('watch mode cancels a pending delay cleanly on shutdown', async () => {
  const controller = new AbortController();
  const fixture = deviceFixture();
  await recovery.watchLinks({
    signal: controller.signal,
    run: () => recovery.restoreLinks(fixture),
    report: () => {},
    sleep: async () => {
      controller.abort();
      throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
    },
  });
  assert.equal(writes(fixture.state).length, 4);
});

test('watch mode suppresses unchanged status but reports each actual repair', async () => {
  const controller = new AbortController();
  const reports = [];
  let attempts = 0;
  await recovery.watchLinks({
    signal: controller.signal,
    run: async () => {
      attempts++;
      if (attempts === 4)
        controller.abort();
      return { healthy: true, issues: [], repaired: attempts === 3 ? ['18999 restored'] : [] };
    },
    sleep: async () => {},
    report: result => reports.push(result),
  });
  assert.equal(reports.length, 2);
  assert.deepEqual(reports[1].repaired, ['18999 restored']);
});

test('pins Windows ADB to an SDK binary and never silently falls back to PATH', () => {
  const exists = candidate => candidate.replaceAll('\\', '/').includes('platform-tools/adb.exe');
  assert.match(recovery.resolveAdbPath({ ANDROID_SDK_ROOT: 'D:/sdk' }, exists, 'win32'), /sdk[\\/]platform-tools[\\/]adb\.exe$/);
  assert.throws(() => recovery.resolveAdbPath({ CAMERA_ADB_PATH: 'missing.exe' }, () => false, 'win32'), /ADB/);
  assert.throws(() => recovery.resolveAdbPath({}, () => false, 'win32'), /ADB/);
});

test('health probes reject unrelated HTTP 200 services and an unready relay', async () => {
  for (const port of [8081, 18999, 18787]) {
    const result = await recovery.probe(port, async () => new Response('{"hello":"world"}'));
    assert.equal(result.alive, false, `port ${port} must verify service identity`);
  }
  assert.equal((await recovery.probe(8081, async () => new Response('packager-status:running'))).alive, true);
  assert.equal((await recovery.probe(18999, async () => new Response('{"ok":true}'))).alive, true);
  assert.equal((await recovery.probe(18787, async () => new Response('{"ready":true,"mode":"usb"}'))).alive, true);
  assert.equal((await recovery.probe(18787, async () => new Response('{"ready":true}', { status: 503 }))).alive, false);
});

test('marks only a refused Metro connection as eligible for automatic startup', async () => {
  const refused = await recovery.probe(8081, async () => {
    throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  });
  assert.equal(refused.unreachable, true);
  const timedOut = await recovery.probe(8081, async () => {
    throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
  });
  assert.notEqual(timedOut.unreachable, true);
});

test('Metro recovery starts once, retries after exit with cooldown, and never replaces a listener', () => {
  let now = 0;
  const children = [];
  const metro = recovery.createMetroRecovery({
    now: () => now,
    launch: () => {
      const child = new EventEmitter();
      child.killed = false;
      child.kill = () => {
        child.killed = true;
      };
      children.push(child);
      return child;
    },
  });
  metro.recover({ alive: true });
  metro.recover({ alive: false });
  assert.equal(children.length, 0);
  metro.recover({ alive: false, unreachable: true });
  metro.recover({ alive: false, unreachable: true });
  assert.equal(children.length, 1);
  children[0].emit('exit', 1);
  now = 5_000;
  metro.recover({ alive: false, unreachable: true });
  assert.equal(children.length, 1);
  now = 30_000;
  metro.recover({ alive: false, unreachable: true });
  assert.equal(children.length, 2);
  metro.stop();
  assert.equal(children[0].killed, false);
  assert.equal(children[1].killed, true);
  now = 60_000;
  metro.recover({ alive: false, unreachable: true });
  assert.equal(children.length, 2);
});

test('Metro launch errors are handled without stopping the recovery loop', () => {
  let now = 0;
  const child = new EventEmitter();
  let attempts = 0;
  const metro = recovery.createMetroRecovery({
    now: () => now,
    launch: () => {
      attempts++;
      if (attempts === 1)
        throw new Error('spawn failed');
      return child;
    },
  });
  assert.match(metro.recover({ alive: false, unreachable: true }), /spawn failed/);
  now = 30_000;
  metro.recover({ alive: false, unreachable: true });
  assert.doesNotThrow(() => child.emit('error', new Error('ENOENT')));
  now = 60_000;
  metro.recover({ alive: false, unreachable: true });
  assert.equal(attempts, 3);
});

test('rejects a live lock but replaces one whose owning process has already exited', async () => {
  const lock = await recovery.acquireWatchLock(0);
  try {
    await assert.rejects(recovery.acquireWatchLock(lock.address().port), /EADDRINUSE/);
  }
  finally {
    await new Promise(resolve => lock.close(resolve));
  }
});

test('real Metro launcher returns a child handle and preserves startup diagnostics', () => {
  const child = new EventEmitter();
  let options;
  const result = recovery.launchMetro({
    spawnProcess: (file, args, launchOptions) => {
      options = launchOptions;
      child.unref = () => {};
      return child;
    },
    adbPath: 'D:/sdk/platform-tools/adb.exe',
    logPath: 'artifacts/metro-recovery.log',
  });
  assert.equal(result, child);
  assert.equal(options.detached, true);
  assert.equal(options.windowsHide, true);
  assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
  assert.equal(typeof options.env.CI, 'string');
});

test('CLI rejects Metro startup outside repair watch mode before accessing devices', () => {
  for (const args of [['--metro'], ['--watch', '--check', '--metro']]) {
    const result = spawnSync(process.execPath, ['scripts/restore-adb-links.mjs', ...args], {
      encoding: 'utf8',
      timeout: 10_000,
      env: { ...process.env, CAMERA_ADB_PATH: 'must-not-be-resolved.exe' },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--metro requires --watch without --check/);
    assert.doesNotMatch(result.stderr, /ADB binary/);
  }
});

test('importing the recovery helpers does not issue ADB commands', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    import assert from 'node:assert/strict';
    let calls = 0;
    childProcess.execFile = (file, args, options, callback) => {
      calls++;
      callback(new Error('ADB must not run during import'));
    };
    syncBuiltinESMExports();
    await import(${JSON.stringify(moduleUrl)});
    assert.equal(calls, 0, 'import must not mutate connected devices');
  `], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr);
});
