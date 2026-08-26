#!/usr/bin/env node
/**
 * Restore the host-side ADB port mappings the app depends on.
 *
 * `adb forward` / `adb reverse` rules live only in the running ADB server:
 * `adb kill-server`, an ADB crash, or a device re-plug wipes them all. When
 * that happens the board and the app are both fine, but the app cannot reach
 * the board and the UI looks like a connection failure. This script puts the
 * mappings back and verifies them, so a broken link is diagnosed in one run
 * instead of being re-investigated from scratch.
 *
 * Usage:
 *   node scripts/restore-adb-links.mjs           # restore + verify
 *   node scripts/restore-adb-links.mjs --check   # verify only, change nothing
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CHECK_ONLY = process.argv.includes('--check');

/**
 * Host -> board mappings, consumed by the `usb` transport in
 * `src/features/home/camera/transport.ts` and `tools/usb-webrtc-relay`.
 *
 * 18999 is camera HTTP/WS; 18889 carries WHEP upstream to the board;
 * 18190 carries the UDP media tunnel. 18787 is hosted by the local
 * `usb-webrtc-relay` process (server.mjs) and must NOT be an adb forward.
 */
const FORWARDS = [
  { host: 18999, device: 8999, purpose: 'camera HTTP API / WebSocket' },
  { host: 18889, device: 8889, purpose: 'WebRTC WHEP signaling upstream' },
  { host: 18190, device: 18190, purpose: 'WebRTC UDP media tunnel' },
];

/** Emulator -> host mappings, so the guest can reach Metro and the board. */
const REVERSES = [
  { port: 8081, purpose: 'Metro dev server' },
  { port: 8999, purpose: 'camera HTTP API' },
  { port: 8889, purpose: 'WebRTC WHEP' },
];

async function adb(args) {
  try {
    const { stdout } = await execFileAsync('adb', args, { timeout: 15_000 });
    return { ok: true, out: stdout.trim() };
  }
  catch (error) {
    const detail = (error.stderr || error.message || '').trim();
    return { ok: false, out: detail };
  }
}

/**
 * Split attached devices into the board and the emulator.
 *
 * The board is an embedded Linux target: it answers ADB but has no
 * `getprop`, so it must not be probed like an Android device.
 */
async function resolveDevices() {
  const { ok, out } = await adb(['devices']);
  if (!ok)
    throw new Error(`\`adb devices\` failed: ${out}`);

  const online = [];
  const unusable = [];
  for (const line of out.split('\n').slice(1)) {
    const [serial, state] = line.trim().split(/\s+/);
    if (!serial)
      continue;
    if (state === 'device')
      online.push(serial);
    else if (state)
      unusable.push(`${serial} (${state})`);
  }

  const emulator = online.find(s => s.startsWith('emulator-'));
  const board = online.find(s => s !== emulator);
  return { board, emulator, unusable };
}

async function applyForwards(board) {
  const results = [];
  for (const rule of FORWARDS) {
    if (CHECK_ONLY) {
      results.push({ ...rule, applied: false });
      continue;
    }
    const { ok, out } = await adb([
      '-s',
      board,
      'forward',
      `tcp:${rule.host}`,
      `tcp:${rule.device}`,
    ]);
    results.push({ ...rule, applied: ok, error: ok ? null : out });
  }
  return results;
}

async function applyReverses(emulator) {
  const results = [];
  for (const rule of REVERSES) {
    if (CHECK_ONLY) {
      results.push({ ...rule, applied: false });
      continue;
    }
    const { ok, out } = await adb([
      '-s',
      emulator,
      'reverse',
      `tcp:${rule.port}`,
      `tcp:${rule.port}`,
    ]);
    results.push({ ...rule, applied: ok, error: ok ? null : out });
  }
  return results;
}

/**
 * Confirm a forward carries real traffic.
 *
 * Reachability is what matters here, not the status code: the board answers
 * `400`/`404` on a bare `/` while being perfectly healthy, so any HTTP reply
 * proves the tunnel works. Only a transport-level failure counts as down.
 */
async function probe(port) {
  try {
    const url = port === 18787 ? `http://127.0.0.1:${port}/stream-health` : `http://127.0.0.1:${port}/status`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(4000),
    });
    if (port === 18787) {
      const data = await response.json().catch(() => null);
      if (data?.ready === true)
        return { alive: true, detail: `relay ready (${data.mode})` };
      return { alive: false, detail: `HTTP ${response.status} (not relay)` };
    }
    return { alive: response.ok, detail: `HTTP ${response.status}` };
  }
  catch (error) {
    return { alive: false, detail: error.name === 'TimeoutError' ? 'timeout' : 'refused' };
  }
}

async function main() {
  const { board, emulator, unusable } = await resolveDevices();

  console.log(CHECK_ONLY ? '== ADB link check ==' : '== Restoring ADB links ==');
  console.log(`board    : ${board ?? 'NOT FOUND'}`);
  console.log(`emulator : ${emulator ?? 'NOT FOUND'}`);
  if (unusable.length)
    console.log(`unusable : ${unusable.join(', ')}`);
  console.log('');

  if (board) {
    const forwards = await applyForwards(board);
    console.log('-- forward (host -> board) --');
    for (const r of forwards) {
      const status = CHECK_ONLY ? '' : r.applied ? 'ok' : `FAILED: ${r.error}`;
      console.log(`  ${r.host} -> ${r.device}  ${r.purpose} ${status}`);
    }
    console.log('');
  }
  else {
    console.log('!! Board offline: camera links cannot be restored.');
    console.log('   Check the USB cable, then re-run this script.\n');
  }

  if (emulator) {
    const reverses = await applyReverses(emulator);
    console.log('-- reverse (emulator -> host) --');
    for (const r of reverses) {
      const status = CHECK_ONLY ? '' : r.applied ? 'ok' : `FAILED: ${r.error}`;
      console.log(`  ${r.port}  ${r.purpose} ${status}`);
    }
    console.log('');
  }
  else {
    console.log('!! Emulator offline: the app cannot reach Metro.\n');
  }

  // Verify the two ports the app actually uses.
  console.log('-- verify --');
  let healthy = true;
  for (const port of [18999, 18787]) {
    const { alive, detail } = await probe(port);
    if (!alive)
      healthy = false;
    console.log(`  ${port}: ${alive ? `reachable (${detail})` : `UNREACHABLE (${detail})`}`);
  }
  console.log('');

  if (healthy && board && emulator) {
    console.log('All camera links are up.');
    console.log('If the app still shows no device, start Metro: pnpm start');
    return;
  }

  console.log('Some links are down. Most likely causes:');
  if (!board)
    console.log('  - Board not attached over USB.');
  if (!emulator)
    console.log('  - Emulator not running.');
  if (board && !healthy) {
    if (CHECK_ONLY) {
      // In --check mode nothing was applied, so a dead port almost always
      // means the rules were wiped rather than the board being broken.
      console.log('  - Port mappings are missing (ADB server was likely restarted).');
      console.log('    Re-run without --check to restore them: pnpm adb:restore');
    }
    else {
      // Rules were just applied and still fail, so the board side is suspect.
      console.log('  - Board services stopped; check net_server_test on port 8999.');
    }
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(`restore-adb-links failed: ${error.message}`);
  process.exitCode = 1;
});
