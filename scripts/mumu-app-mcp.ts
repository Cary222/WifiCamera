import { Buffer } from 'node:buffer';
import { execFile } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { parseAdbDevices, resolveConfiguredReleaseApkPath, resolveEmulatorSerial, resolveProjectPath } from './mumu-app-mcp-core';

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactDirectory = path.join(projectRoot, 'artifacts', 'mumu');
const packageName = process.env.MUMU_APP_PACKAGE ?? 'com.wificamera.development';
const configuredSerial = process.env.MUMU_DEVICE_SERIAL;

if (!/^[a-z][\w.]*$/i.test(packageName))
  throw new Error('MUMU_APP_PACKAGE must be a valid Android package name.');

const coordinate = z.number().int().min(0).max(10_000);

function toolText(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function artifactName(name: string | undefined, extension: '.png' | '.xml'): string {
  const value = name ?? `mumu-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}${extension}`;
  if (!new RegExp(`^[A-Za-z0-9][A-Za-z0-9._-]*\\${extension}$`).test(value))
    throw new Error(`Artifact name must be a safe filename ending in ${extension}.`);
  return value;
}

function adbFailure(args: string[], error: unknown): Error {
  const detail = error && typeof error === 'object' && 'stderr' in error
    ? String(error.stderr).trim()
    : '';
  const command = `adb ${args.join(' ')}`;
  return new Error(detail ? `${command} failed: ${detail}` : `${command} failed.`);
}

async function adb(args: string[], timeout = 15_000): Promise<string> {
  try {
    const { stdout } = await execFileAsync('adb', args, { maxBuffer: 4 * 1024 * 1024, timeout });
    return stdout.trim();
  }
  catch (error) {
    throw adbFailure(args, error);
  }
}

async function adbBuffer(args: string[], timeout = 15_000): Promise<Buffer> {
  try {
    const { stdout } = await execFileAsync('adb', args, { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024, timeout });
    return Buffer.from(stdout);
  }
  catch (error) {
    throw adbFailure(args, error);
  }
}

async function emulatorSerial(requested?: string): Promise<string> {
  const output = await adb(['devices', '-l']);
  return resolveEmulatorSerial(parseAdbDevices(output), requested ?? configuredSerial);
}

async function currentFocus(serial: string): Promise<string | null> {
  const output = await adb(['-s', serial, 'shell', 'dumpsys', 'window', 'windows']);
  return output.match(/mCurrentFocus=Window\{[^}]*\s([^\s}]+)\}/)?.[1] ?? null;
}

const server = new McpServer({ name: 'wificamera-mumu-app', version: '1.0.0' });

server.registerTool('mumu_status', {
  title: 'MuMu App status',
  description: 'Report the selected local Android emulator, target app installation state, and focused activity. Never selects a non-emulator ADB device.',
  inputSchema: { deviceSerial: z.string().optional() },
  annotations: { openWorldHint: false, readOnlyHint: true },
}, async ({ deviceSerial }) => {
  const serial = await emulatorSerial(deviceSerial);
  const installed = await adb(['-s', serial, 'shell', 'pm', 'path', packageName]);
  return toolText({
    deviceSerial: serial,
    focusedActivity: await currentFocus(serial),
    installed: Boolean(installed),
    packageName,
  });
});

server.registerTool('mumu_launch', {
  title: 'Launch WifiCamera app',
  description: 'Launch the configured WifiCamera app on the selected local emulator.',
  inputSchema: { deviceSerial: z.string().optional() },
  annotations: { openWorldHint: false },
}, async ({ deviceSerial }) => {
  const serial = await emulatorSerial(deviceSerial);
  const output = await adb(['-s', serial, 'shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1']);
  return toolText({ deviceSerial: serial, launchedPackage: packageName, output });
});

server.registerTool('mumu_screenshot', {
  title: 'Capture MuMu screenshot',
  description: 'Capture the current emulator screen to artifacts/mumu in this project.',
  inputSchema: {
    deviceSerial: z.string().optional(),
    outputName: z.string().optional(),
  },
  annotations: { openWorldHint: false },
}, async ({ deviceSerial, outputName }) => {
  const serial = await emulatorSerial(deviceSerial);
  const fileName = artifactName(outputName, '.png');
  const outputPath = path.join(artifactDirectory, fileName);
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(outputPath, await adbBuffer(['-s', serial, 'exec-out', 'screencap', '-p']));
  return toolText({ deviceSerial: serial, outputPath: outputPath.replaceAll('\\', '/') });
});

server.registerTool('mumu_install_apk', {
  title: 'Install project APK on MuMu',
  description: 'Install an APK located inside this project onto the selected local emulator.',
  inputSchema: {
    apkPath: z.string().min(1),
    deviceSerial: z.string().optional(),
  },
  annotations: { openWorldHint: false },
}, async ({ apkPath, deviceSerial }) => {
  const serial = await emulatorSerial(deviceSerial);
  const resolvedPath = resolveProjectPath(projectRoot, apkPath);
  if (!resolvedPath.endsWith('.apk'))
    throw new Error('Only .apk files can be installed.');
  await stat(resolvedPath);
  const output = await adb(['-s', serial, 'install', '-r', resolvedPath], 180_000);
  return toolText({ deviceSerial: serial, installedApk: resolvedPath, output });
});

server.registerTool('mumu_install_release', {
  title: 'Install configured Android Release APK on MuMu',
  description: 'Install the release APK from the output directory explicitly configured by android/app/build.gradle.',
  inputSchema: { deviceSerial: z.string().optional() },
  annotations: { openWorldHint: false },
}, async ({ deviceSerial }) => {
  const serial = await emulatorSerial(deviceSerial);
  const buildScript = await readFile(path.join(projectRoot, 'android', 'app', 'build.gradle'), 'utf8');
  const releaseApk = resolveConfiguredReleaseApkPath(buildScript);
  await stat(releaseApk);
  const output = await adb(['-s', serial, 'install', '-r', releaseApk], 180_000);
  return toolText({ deviceSerial: serial, installedApk: releaseApk, output });
});

server.registerTool('mumu_tap', {
  title: 'Tap MuMu screen',
  description: 'Tap a specific screen coordinate on the selected local emulator.',
  inputSchema: { deviceSerial: z.string().optional(), x: coordinate, y: coordinate },
  annotations: { openWorldHint: false },
}, async ({ deviceSerial, x, y }) => {
  const serial = await emulatorSerial(deviceSerial);
  await adb(['-s', serial, 'shell', 'input', 'tap', String(x), String(y)]);
  return toolText({ deviceSerial: serial, x, y });
});

server.registerTool('mumu_long_press', {
  title: 'Long press MuMu screen',
  description: 'Press and hold a specific coordinate on the selected local emulator.',
  inputSchema: {
    deviceSerial: z.string().optional(),
    durationMs: z.number().int().min(350).max(10_000).default(600),
    x: coordinate,
    y: coordinate,
  },
  annotations: { openWorldHint: false },
}, async ({ deviceSerial, durationMs, x, y }) => {
  const serial = await emulatorSerial(deviceSerial);
  await adb(['-s', serial, 'shell', 'input', 'swipe', String(x), String(y), String(x), String(y), String(durationMs)]);
  return toolText({ deviceSerial: serial, durationMs, x, y });
});

server.registerTool('mumu_swipe', {
  title: 'Swipe MuMu screen',
  description: 'Swipe between two screen coordinates on the selected local emulator.',
  inputSchema: {
    deviceSerial: z.string().optional(),
    durationMs: z.number().int().min(50).max(10_000).default(300),
    endX: coordinate,
    endY: coordinate,
    startX: coordinate,
    startY: coordinate,
  },
  annotations: { openWorldHint: false },
}, async ({ deviceSerial, durationMs, endX, endY, startX, startY }) => {
  const serial = await emulatorSerial(deviceSerial);
  await adb(['-s', serial, 'shell', 'input', 'swipe', String(startX), String(startY), String(endX), String(endY), String(durationMs)]);
  return toolText({ deviceSerial: serial, durationMs, endX, endY, startX, startY });
});

server.registerTool('mumu_back', {
  title: 'Navigate MuMu back',
  description: 'Send the Android Back key to the selected local emulator.',
  inputSchema: { deviceSerial: z.string().optional() },
  annotations: { openWorldHint: false },
}, async ({ deviceSerial }) => {
  const serial = await emulatorSerial(deviceSerial);
  await adb(['-s', serial, 'shell', 'input', 'keyevent', 'BACK']);
  return toolText({ deviceSerial: serial, key: 'BACK' });
});

server.registerTool('mumu_stop', {
  title: 'Stop WifiCamera app',
  description: 'Force-stop the configured WifiCamera app on the selected local emulator.',
  inputSchema: { deviceSerial: z.string().optional() },
  annotations: { openWorldHint: false },
}, async ({ deviceSerial }) => {
  const serial = await emulatorSerial(deviceSerial);
  await adb(['-s', serial, 'shell', 'am', 'force-stop', packageName]);
  return toolText({ deviceSerial: serial, stoppedPackage: packageName });
});

server.registerTool('mumu_ui_dump', {
  title: 'Dump MuMu UI hierarchy',
  description: 'Capture the Android accessibility hierarchy to artifacts/mumu. Reports the real ADB failure if uiautomator cannot inspect the current screen.',
  inputSchema: { deviceSerial: z.string().optional(), outputName: z.string().optional() },
  annotations: { openWorldHint: false, readOnlyHint: true },
}, async ({ deviceSerial, outputName }) => {
  const serial = await emulatorSerial(deviceSerial);
  const fileName = artifactName(outputName, '.xml');
  const outputPath = path.join(artifactDirectory, fileName);
  const remotePath = '/sdcard/mumu-mcp-window.xml';
  await adb(['-s', serial, 'shell', 'uiautomator', 'dump', remotePath]);
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(outputPath, await adbBuffer(['-s', serial, 'exec-out', 'cat', remotePath]));
  return toolText({ deviceSerial: serial, outputPath: outputPath.replaceAll('\\', '/') });
});

server.registerTool('mumu_logcat', {
  title: 'Read WifiCamera logcat',
  description: 'Read a bounded recent logcat excerpt for the configured WifiCamera app.',
  inputSchema: { deviceSerial: z.string().optional(), lines: z.number().int().min(1).max(1_000).default(200) },
  annotations: { openWorldHint: false, readOnlyHint: true },
}, async ({ deviceSerial, lines }) => {
  const serial = await emulatorSerial(deviceSerial);
  const pid = (await adb(['-s', serial, 'shell', 'pidof', packageName])).trim();
  const args = ['-s', serial, 'logcat', '-d', '-t', String(lines)];
  if (/^\d+$/.test(pid))
    args.push(`--pid=${pid}`);
  const output = await adb(args, 30_000);
  return toolText({ deviceSerial: serial, log: output, packageName, pid: /^\d+$/.test(pid) ? pid : null });
});

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'MuMu MCP server failed to start.');
  process.exitCode = 1;
});
