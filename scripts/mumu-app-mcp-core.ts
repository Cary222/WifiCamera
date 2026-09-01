import path from 'node:path';

export type AdbDevice = {
  serial: string;
  state: string;
};

const LOCAL_EMULATOR_PATTERN = /^(?:emulator-\d+|127\.0\.0\.1:\d{1,5})$/;

export function parseAdbDevices(output: string): AdbDevice[] {
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('List of devices attached'))
    .map((line) => {
      const [serial = '', state = ''] = line.split(/\s+/, 2);
      return { serial, state };
    })
    .filter(device => device.serial && device.state);
}

export function isLocalEmulatorSerial(serial: string): boolean {
  return LOCAL_EMULATOR_PATTERN.test(serial);
}

export function resolveEmulatorSerial(devices: AdbDevice[], preferredSerial?: string): string {
  const online = devices.filter(device => device.state === 'device');

  if (preferredSerial) {
    if (!isLocalEmulatorSerial(preferredSerial))
      throw new Error(`Configured serial "${preferredSerial}" is not a local emulator.`);
    if (!online.some(device => device.serial === preferredSerial))
      throw new Error(`Configured emulator "${preferredSerial}" is not online.`);
    return preferredSerial;
  }

  const emulator = online.find(device => device.serial.startsWith('emulator-'))
    ?? online.find(device => device.serial.startsWith('127.0.0.1:'));
  if (!emulator)
    throw new Error('No local Android emulator is online. Refusing to select a non-emulator ADB device.');

  return emulator.serial;
}

/** Resolves a relative project file path without allowing directory escape. */
export function resolveProjectPath(projectRoot: string, candidate: string): string {
  if (!candidate || path.isAbsolute(candidate))
    throw new Error('Path must be a non-empty relative path inside project root.');

  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, candidate);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('Path must stay inside project root.');

  return resolved.replaceAll('\\', '/');
}

/** Reads the app module's explicit Gradle output root for the release APK. */
export function resolveConfiguredReleaseApkPath(appBuildGradle: string): string {
  const match = appBuildGradle.match(/buildDir\s*=\s*file\(["']([^"']+)["']\)/);
  if (!match?.[1])
    throw new Error('Android app build.gradle does not declare an explicit buildDir.');

  return path.join(match[1], 'outputs', 'apk', 'release', 'app-release.apk').replaceAll('\\', '/');
}
