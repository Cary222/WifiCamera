#!/usr/bin/env node
/**
 * Host-only recovery: restore missing USB forwards and the Metro reverse.
 * Never restart ADB, overwrite another mapping, or change board configuration.
 *
 * pnpm adb:restore  - repair once and verify
 * pnpm adb:check    - inspect without modifying mappings
 * pnpm adb:watch    - keep repairing while this process is running (Ctrl+C stops)
 * pnpm dev:watch    - also start/restart Metro when its listener is absent
 *
 * CAMERA_ADB_PATH pins the SDK adb binary. CAMERA_BOARD_SERIAL selects the board
 * (defaults to this project's board); CAMERA_EMULATOR_SERIAL selects a specific
 * emulator or a USB-connected development phone. No unrelated device is inferred
 * to be a camera board. Metro/relay service failures are reported, not force-killed.
 */

import { execFile, spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { delimiter, dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
// 18787 belongs to the relay process, never to an ADB forward.
const FORWARDS = [[18999, 8999], [18889, 8889], [18190, 18190]];

export function resolveAdbPath(env = process.env, exists = existsSync, platform = process.platform) {
  if (env.CAMERA_ADB_PATH) {
    if (!exists(env.CAMERA_ADB_PATH))
      throw new Error(`ADB binary not found: ${env.CAMERA_ADB_PATH}`);
    return env.CAMERA_ADB_PATH;
  }
  const executable = platform === 'win32' ? 'adb.exe' : 'adb';
  const candidates = [env.ANDROID_SDK_ROOT, env.ANDROID_HOME, 'D:/app/AndroidSDK']
    .filter(Boolean)
    .map(root => join(root, 'platform-tools', executable));
  const found = candidates.find(candidate => exists(candidate));
  if (found)
    return found;
  if (platform !== 'win32')
    return 'adb';
  throw new Error('SDK ADB not found. Set CAMERA_ADB_PATH; refusing an unpinned Windows PATH binary.');
}

function createAdb(adbPath) {
  return async (args) => {
    try {
      const { stdout } = await execFileAsync(adbPath, args, { timeout: 15_000, windowsHide: true });
      return { ok: true, out: stdout.trim() };
    }
    catch (error) {
      return { ok: false, out: String(error.stderr || error.message || error).trim() };
    }
  };
}

/** Verify the actual service, not just any HTTP listener on the port. */
export async function probe(port, request = fetch) {
  try {
    const path = port === 18787 ? '/stream-health' : '/status';
    const response = await request(`http://127.0.0.1:${port}${path}`, {
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok)
      return { alive: false, detail: `HTTP ${response.status}` };
    if (port === 8081) {
      const alive = (await response.text()).trim() === 'packager-status:running';
      return { alive, detail: alive ? 'Metro running' : 'not Metro; start pnpm start' };
    }
    const data = await response.json();
    const alive = port === 18787 ? data?.ready === true : data?.ok === true;
    return { alive, detail: alive ? 'service ready' : 'service not ready or wrong endpoint' };
  }
  catch (error) {
    return {
      alive: false,
      unreachable: error.cause?.code === 'ECONNREFUSED',
      detail: error.name === 'TimeoutError' ? 'timeout' : 'unreachable or invalid response',
    };
  }
}

/** Repair only this project's missing rules; never overwrite another mapping. */
async function ensureRules({ adb: run, serial, kind, rules, checkOnly, issues, repaired }) {
  const listArgs = kind === 'forward' ? ['forward', '--list'] : ['-s', serial, 'reverse', '--list'];
  const listed = await run(listArgs);
  if (!listed.ok) {
    issues.push(`${kind} list: ${listed.out}`);
    return;
  }
  const rows = listed.out.split('\n').map(line => line.trim().split(/\s+/));
  for (const [local, remote] of rules) {
    const row = rows.find(item => item[1] === `tcp:${local}`);
    if (row && row[2] === `tcp:${remote}` && (kind === 'reverse' || row[0] === serial))
      continue;
    if (row) {
      issues.push(`${kind} tcp:${local} conflicts with ${row.join(' ')}`);
      continue;
    }
    if (checkOnly) {
      issues.push(`missing ${kind} tcp:${local}`);
      continue;
    }
    const applied = await run(['-s', serial, kind, '--no-rebind', `tcp:${local}`, `tcp:${remote}`]);
    if (applied.ok)
      repaired.push(`${serial} ${kind} ${local}->${remote}`);
    else
      issues.push(`${kind} tcp:${local}: ${applied.out}`);
  }
  if (!checkOnly) {
    const verified = await run(listArgs);
    const current = verified.out.split('\n').map(line => line.trim().split(/\s+/));
    for (const [local, remote] of rules) {
      if (!verified.ok || !current.some(row => row[1] === `tcp:${local}` && row[2] === `tcp:${remote}` && (kind === 'reverse' || row[0] === serial)))
        issues.push(`unverified ${serial} ${kind} tcp:${local}`);
    }
  }
}

export async function restoreLinks({
  adb: run = createAdb(resolveAdbPath()),
  probe: check = probe,
  checkOnly = false,
  boardSerial = process.env.CAMERA_BOARD_SERIAL || 'e2621126569ad4a5',
  emulatorSerial = process.env.CAMERA_EMULATOR_SERIAL,
} = {}) {
  const issues = [];
  const repaired = [];
  const devices = await run(['devices', '-l']);
  if (!devices.ok)
    return { healthy: false, issues: [`ADB: ${devices.out}`], repaired };
  const online = devices.out.split('\n')
    .map(line => line.trim().split(/\s+/))
    .filter(([, state]) => state === 'device')
    .map(([serial]) => serial);
  // A physical Android phone must never be inferred to be the embedded board.
  const board = online.includes(boardSerial) ? boardSerial : undefined;
  const candidates = online.filter(serial => serial !== boardSerial && /^(?:emulator-|127\.0\.0\.1:|localhost:)/.test(serial));
  const emulator = emulatorSerial
    ? online.find(serial => serial === emulatorSerial && serial !== boardSerial)
    : candidates.length === 1 ? candidates[0] : undefined;
  if (board)
    await ensureRules({ adb: run, serial: board, kind: 'forward', rules: FORWARDS, checkOnly, issues, repaired });
  else
    issues.push(`board ${boardSerial} offline; waiting for USB (WiFi direct may still work)`);
  if (emulator)
    await ensureRules({ adb: run, serial: emulator, kind: 'reverse', rules: [[8081, 8081]], checkOnly, issues, repaired });
  else
    issues.push('emulator unavailable or ambiguous; set CAMERA_EMULATOR_SERIAL');
  const health = {};
  for (const port of [18999, 18787, 8081]) {
    health[port] = await check(port);
    if (!health[port].alive)
      issues.push(`${port}: ${health[port].detail}`);
  }
  return { healthy: issues.length === 0, board, emulator, issues, repaired, health };
}

function reportResult(result) {
  console.log(`[${new Date().toISOString()}] ${result.healthy ? 'healthy' : 'waiting'} board=${result.board ?? '-'} emulator=${result.emulator ?? '-'}`);
  for (const repaired of result.repaired)
    console.log(`  restored: ${repaired}`);
  for (const issue of result.issues)
    console.log(`  pending: ${issue}`);
}

/** Sequential iterations; a slow or offline device cannot spawn overlapping ADBs. */
export async function watchLinks({ signal, run = restoreLinks, sleep = delay, report = reportResult } = {}) {
  let failures = 0;
  let lastSummary = '';
  while (!signal?.aborted) {
    let result;
    try {
      result = await run();
    }
    catch (error) {
      result = { healthy: false, issues: [String(error.message || error)], repaired: [] };
    }
    const summary = JSON.stringify({ ...result, repaired: [] });
    if (summary !== lastSummary || result.repaired.length)
      report(result);
    lastSummary = summary;
    failures = result.healthy ? 0 : failures + 1;
    if (signal?.aborted)
      break;
    const interval = Math.min(30_000, 5_000 * 2 ** Math.min(3, Math.max(0, failures - 1)));
    try {
      await sleep(interval, undefined, { signal });
    }
    catch (error) {
      if (!signal?.aborted)
        throw error;
    }
  }
}

/** Only a missing listener is auto-started; never kill or replace an existing Metro. */
export function createMetroRecovery({ launch, now = Date.now }) {
  let child = null;
  let lastAttempt = -Infinity;
  let stopped = false;
  return {
    recover(health) {
      if (stopped || health?.alive || !health?.unreachable || child || now() - lastAttempt < 30_000)
        return null;
      lastAttempt = now();
      try {
        const started = launch();
        child = started;
        const clear = () => {
          if (child === started)
            child = null;
        };
        started.once('exit', clear);
        started.once('error', clear);
        return 'Metro startup requested; waiting for /status verification';
      }
      catch (error) {
        return `Metro startup failed: ${error.message}`;
      }
    },
    stop() {
      stopped = true;
      // Only a child created by this watcher is ours to stop.
      child?.kill();
      child = null;
    },
  };
}

/** Start Metro as its own service and keep its startup output for diagnosis. */
export function launchMetro({ spawnProcess = spawn, adbPath, logPath }) {
  const projectRoot = fileURLToPath(new URL('../', import.meta.url));
  const pathKey = Object.keys(process.env).find(key => key.toLowerCase() === 'path') || 'PATH';
  const output = createWriteStream(logPath, { flags: 'a' });
  const child = spawnProcess(process.execPath, [
    join(projectRoot, 'node_modules/expo/bin/cli'),
    'start',
    '--dev-client',
    '--port',
    '8081',
    '--host',
    'localhost',
  ], {
    cwd: projectRoot,
    windowsHide: true,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CI: '1', [pathKey]: `${dirname(adbPath)}${delimiter}${process.env[pathKey] || ''}` },
  });
  child.stdout?.pipe(output, { end: false });
  child.stderr?.pipe(output, { end: false });
  child.once('exit', () => output.end());
  child.unref();
  return child;
}

/** A loopback-only lock is released by Windows even after a forced process exit. */
export async function acquireWatchLock(port = 18998) {
  const lock = createServer(socket => socket.destroy());
  await new Promise((resolve, reject) => {
    lock.once('error', reject);
    lock.listen(port, '127.0.0.1', resolve);
  });
  return lock;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node scripts/restore-adb-links.mjs [--check] [--watch] [--metro]');
    console.log('Configure CAMERA_ADB_PATH, CAMERA_BOARD_SERIAL, CAMERA_EMULATOR_SERIAL if needed.');
    return;
  }
  if (args.some(arg => !['--check', '--watch', '--metro'].includes(arg)))
    throw new Error('Unknown option. Use --help.');
  if (args.includes('--metro') && (!args.includes('--watch') || args.includes('--check')))
    throw new Error('--metro requires --watch without --check');
  const adbPath = resolveAdbPath();
  const run = () => restoreLinks({ adb: createAdb(adbPath), checkOnly: args.includes('--check') });
  console.log(`ADB pinned to ${adbPath}`);
  if (!args.includes('--watch')) {
    const result = await run();
    reportResult(result);
    process.exitCode = result.healthy ? 0 : 1;
    return;
  }
  const lock = await acquireWatchLock();
  if (process.platform === 'win32')
    lock.allowHalfOpen = true;
  const projectRoot = fileURLToPath(new URL('../', import.meta.url));
  const artifactsDir = join(projectRoot, 'artifacts');
  const metroLog = join(artifactsDir, 'metro-recovery.log');
  mkdirSync(artifactsDir, { recursive: true });
  const metro = createMetroRecovery({
    launch: () => launchMetro({ adbPath, logPath: metroLog }),
  });
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  console.log('Recovery watcher running; Ctrl+C stops it. No board changes or command replays.');
  try {
    await watchLinks({
      run: async () => {
        const result = await run();
        if (args.includes('--metro') && !controller.signal.aborted) {
          const action = metro.recover(result.health?.[8081]);
          if (action)
            result.issues.push(action);
        }
        return result;
      },
      signal: controller.signal,
    });
  }
  finally {
    metro.stop();
    lock.close();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`restore-adb-links failed: ${error.message}`);
    process.exitCode = 1;
  });
}
