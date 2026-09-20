/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { nextPreviewVersion, previewEnvironment, validatePreviewInspection } from './android-preview.mjs';
import { selectApk } from './build-android-embedded.mjs';

const badging = 'package: name=\'com.wificamera.preview\' versionCode=\'42\' versionName=\'1.0.0\'\nlaunchable-activity: name=\'com.wificamera.development.MainActivity\'\nnative-code: \'armeabi-v7a\' \'arm64-v8a\'\n';
const manifest = 'E: application\n  A: android:debuggable(0x0101000f)=(type 0x12)0x0\n  E: meta-data\n    A: android:name(0x01010003)="expo.modules.updates.ENABLED" (Raw: "expo.modules.updates.ENABLED")\n    A: android:value(0x01010024)=(type 0x12)0x0\n';
const options = { versionCode: 42, arches: ['armeabi-v7a', 'arm64-v8a'] };

test('exporting a preview bundle does not start the development camera proxy', () => {
  const require = createRequire(import.meta.url);
  let proxyStarts = 0;
  vm.runInNewContext(readFileSync(new URL('../metro.config.js', import.meta.url), 'utf8'), {
    __dirname: 'fixture',
    module: { exports: {} },
    console: { log() {} },
    process: { env: previewEnvironment({}) },
    URL,
    require(name) {
      if (name === 'expo/metro-config')
        return { getDefaultConfig: () => ({}) };
      if (name === 'uniwind/metro')
        return { withUniwindConfig: config => config };
      if (name === 'ws')
        return { WebSocketServer: class { constructor() { proxyStarts++; } on() {} } };
      if (name === 'node:http')
        return { createServer: () => ({ listen() {}, on() {} }) };
      return require(name);
    },
  });
  assert.equal(proxyStarts, 0);
});

test('selects release metadata instead of an existing debug APK', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'preview-metadata-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const variant of ['debug', 'release']) {
    const dir = path.join(root, 'outputs/apk', variant);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `app-${variant}.apk`), variant);
    writeFileSync(path.join(dir, 'output-metadata.json'), JSON.stringify({
      artifactType: { type: 'APK' },
      variantName: variant,
      elements: [{ filters: [], outputFile: `app-${variant}.apk` }],
    }));
  }
  assert.equal(selectApk({ buildDir: root, variant: 'release' }), path.join(root, 'outputs/apk/release/app-release.apk'));
  assert.equal(selectApk({ buildDir: root }), path.join(root, 'outputs/apk/debug/app-debug.apk'));
});

test('preview ignores local dotenv and removes public development endpoint overrides', () => {
  const original = {
    PATH: 'tools',
    JAVA_HOME: 'JDK',
    NODE_ENV: 'development',
    EXPO_PUBLIC_APP_ENV: 'development',
    EXPO_PUBLIC_CAMERA_BASE_URL: 'http://10.0.2.2:18999',
    EXPO_PUBLIC_CAMERA_WHEP_URL: 'http://localhost:18787/board-webrtc/cam0/whep',
    EXPO_PUBLIC_API_URL: 'http://localhost:3000',
    EXPO_PUBLIC_OTA_BACKEND_URL: 'http://localhost:7788',
  };
  const env = previewEnvironment(original);
  assert.equal(env.EXPO_PUBLIC_APP_ENV, 'preview');
  assert.equal(env.NODE_ENV, 'production');
  assert.equal(env.EXPO_NO_DOTENV, '1');
  assert.equal(env.EXPO_PUBLIC_CAMERA_BASE_URL, 'http://192.168.1.1:8999');
  assert.equal(env.EXPO_PUBLIC_CAMERA_WHEP_URL, 'http://192.168.1.1:8889/cam0/whep');
  assert.equal(env.EXPO_PUBLIC_API_URL, undefined);
  assert.equal(env.EXPO_PUBLIC_OTA_BACKEND_URL, undefined);
  assert.equal(env.PATH, 'tools');
  assert.equal(original.EXPO_PUBLIC_APP_ENV, 'development');
});

test('version codes increase even when builds occur in the same minute or clock moves back', () => {
  const now = Date.UTC(2026, 8, 10);
  const first = nextPreviewVersion(0, now);
  assert.ok(Number.isSafeInteger(first) && first > 1);
  assert.equal(nextPreviewVersion(first, now), first + 1);
  assert.equal(nextPreviewVersion(first, now - 60000), first + 1);
  assert.throws(() => nextPreviewVersion(2100000000, now), /version/i);
  assert.throws(() => nextPreviewVersion('bad', now), /version/i);
});

test('accepts the separately identified non-debuggable offline preview with both phone ABIs', () => {
  assert.doesNotThrow(() => validatePreviewInspection({ badging, manifest, ...options }));
});

test('accepts SDK 36 aapt2 boolean output with full Android namespace', () => {
  const modern = manifest.replaceAll('android:', 'http://schemas.android.com/apk/res/android:').replaceAll('(type 0x12)0x0', 'false');
  assert.doesNotThrow(() => validatePreviewInspection({ badging, manifest: modern, ...options }));
  assert.throws(() => validatePreviewInspection({ badging, manifest: modern.replace('debuggable(0x0101000f)=false', 'debuggable(0x0101000f)=true'), ...options }), /debug/i);
  assert.throws(() => validatePreviewInspection({ badging, manifest: modern.replace('value(0x01010024)=false', 'value(0x01010024)=true'), ...options }), /updates/i);
});

for (const [name, changes, pattern] of [
  ['development package', { badging: badging.replace('com.wificamera.preview', 'com.wificamera.development') }, /package/i],
  ['stale version', { versionCode: 43 }, /version/i],
  ['debuggable APK', { badging: `${badging}application-debuggable\n` }, /debug/i],
  ['missing launcher', { badging: badging.replace(/launchable-activity[^\n]*\n/, '') }, /launcher/i],
  ['missing ARM ABI', { badging: badging.replace('\'armeabi-v7a\'', '') }, /armeabi-v7a/i],
  ['enabled updates', { manifest: manifest.replace(/(android:value[^\n]*)0x0/, '$10xffffffff') }, /updates/i],
  ['missing updates metadata', { manifest: 'E: application\n' }, /updates/i],
  ['development launcher activity', { manifest: `${manifest}E: activity\n A: android:name="expo.modules.devlauncher.launcher.DevLauncherActivity"\n` }, /launcher/i],
]) {
  test(`rejects ${name} before releasing a preview APK`, () => {
    assert.throws(() => validatePreviewInspection({ badging, manifest, ...options, ...changes }), pattern);
  });
}
