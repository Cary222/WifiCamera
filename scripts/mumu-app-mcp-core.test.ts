import path from 'node:path';
import { describe, expect, it } from '@jest/globals';
import {
  parseAdbDevices,
  resolveConfiguredReleaseApkPath,
  resolveEmulatorSerial,
  resolveProjectPath,
} from './mumu-app-mcp-core';

describe('MuMu App MCP device resolution', () => {
  it('prefers the Android emulator and never selects the attached board', () => {
    const devices = parseAdbDevices([
      'List of devices attached',
      'e2621126569ad4a5\tdevice',
      'emulator-5554\tdevice product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64',
      '',
    ].join('\n'));

    expect(resolveEmulatorSerial(devices)).toBe('emulator-5554');
  });

  it('accepts an explicitly configured local MuMu ADB endpoint', () => {
    const devices = parseAdbDevices([
      'List of devices attached',
      'e2621126569ad4a5\tdevice',
      '127.0.0.1:16384\tdevice product:MuMu model:MuMu',
      '',
    ].join('\n'));

    expect(resolveEmulatorSerial(devices, '127.0.0.1:16384')).toBe('127.0.0.1:16384');
  });

  it('rejects an explicit board serial and leaves it untouched', () => {
    const devices = parseAdbDevices([
      'List of devices attached',
      'e2621126569ad4a5\tdevice',
      '',
    ].join('\n'));

    expect(() => resolveEmulatorSerial(devices, 'e2621126569ad4a5')).toThrow('not a local emulator');
  });
});

describe('MuMu App MCP project path boundaries', () => {
  const root = process.platform === 'win32' ? 'D:/app/WifiCamera' : '/app/WifiCamera';

  it('allows APK and screenshot files inside the project root', () => {
    const expected = path.resolve(root, 'android/app/build/outputs/apk/release/app-release.apk');
    expect(resolveProjectPath(root, 'android/app/build/outputs/apk/release/app-release.apk'))
      .toBe(expected);
  });

  it('rejects a path that escapes the project root', () => {
    expect(() => resolveProjectPath(root, '../secrets.apk')).toThrow('must stay inside project root');
  });

  it('resolves the configured Android release APK outside the source root', () => {
    expect(resolveConfiguredReleaseApkPath('buildDir = file("D:/b/app")'))
      .toBe('D:/b/app/outputs/apk/release/app-release.apk');
  });
});
