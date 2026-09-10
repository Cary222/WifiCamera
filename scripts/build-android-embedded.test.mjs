/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const source = 'src/assets/stellar';
const target = 'android/app/src/main/assets/stellar';
const manifest = 'android/.stellar-sync-manifest.json';
const hash = value => createHash('sha256').update(value).digest('hex');

function put(root, relative, value) {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, value);
  return file;
}

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), '星图 构建 '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'scripts'));
  mkdirSync(path.join(root, 'android'));
  for (const name of ['sync-stellar-assets.mjs', 'verify-stellar-sync.mjs', 'check-stellarium-assets.mjs'])
    copyFileSync(path.join(scripts, name), path.join(root, 'scripts', name));
  put(root, `${source}/index.html`, 'original scene');
  return root;
}

function run(root, script, args = []) {
  return spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
  });
}

function success(result) {
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
}

function failure(result, pattern) {
  assert.equal(result.status, 1, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, pattern);
}

function sync(root, ...args) {
  return run(root, 'sync-stellar-assets.mjs', args);
}

test('sync records exact source SHA-256 and safely advances an unchanged target', (t) => {
  const root = fixture(t);
  success(sync(root));
  assert.ok(existsSync(path.join(root, manifest)), 'successful sync must record its baseline');
  const first = JSON.parse(readFileSync(path.join(root, manifest), 'utf8'));
  assert.equal(first.version, 1);
  assert.equal(first.files['index.html'].sha256, hash('original scene'));
  assert.equal(first.files['index.html'].size, 14);
  put(root, `${source}/index.html`, 'new scene');
  success(sync(root));
  assert.equal(readFileSync(path.join(root, target, 'index.html'), 'utf8'), 'new scene');
});

test('first sync refuses different bytes, including JSON formatting and line endings', (t) => {
  const root = fixture(t);
  put(root, `${target}/index.html`, 'independent scene');
  put(root, `${source}/catalog.json`, '{"v":1}\n');
  put(root, `${target}/catalog.json`, '{ "v": 1 }\r\n');
  failure(sync(root), /index\.html/);
  assert.match(sync(root).stderr, /catalog\.json/);
  assert.equal(readFileSync(path.join(root, target, 'index.html'), 'utf8'), 'independent scene');
  assert.equal(existsSync(path.join(root, manifest)), false);
});

test('target edits prevent all writes, including other safe updates and baseline changes', (t) => {
  const root = fixture(t);
  put(root, `${source}/engine.js`, 'engine v1');
  success(sync(root));
  const before = existsSync(path.join(root, manifest)) ? readFileSync(path.join(root, manifest)) : null;
  put(root, `${source}/engine.js`, 'engine v2');
  put(root, `${target}/index.html`, 'target-only edit');
  failure(sync(root), /index\.html/);
  assert.equal(readFileSync(path.join(root, target, 'engine.js'), 'utf8'), 'engine v1');
  assert.deepEqual(readFileSync(path.join(root, manifest)), before);
});

test('safe source deletions are mirrored but untracked target files are not deleted', (t) => {
  const root = fixture(t);
  put(root, `${source}/obsolete.dat`, 'old data');
  success(sync(root));
  rmSync(path.join(root, source, 'obsolete.dat'));
  success(sync(root));
  assert.equal(existsSync(path.join(root, target, 'obsolete.dat')), false);
  put(root, `${target}/personal.dat`, 'keep me');
  failure(sync(root), /personal\.dat/);
  assert.equal(readFileSync(path.join(root, target, 'personal.dat'), 'utf8'), 'keep me');
});

test('target deletions and independently modified stale files are conflicts', (t) => {
  const root = fixture(t);
  put(root, `${source}/obsolete.dat`, 'old data');
  success(sync(root));
  rmSync(path.join(root, target, 'index.html'));
  put(root, `${target}/obsolete.dat`, 'independent data');
  rmSync(path.join(root, source, 'obsolete.dat'));
  const result = sync(root);
  failure(result, /index\.html/);
  assert.match(result.stderr, /obsolete\.dat/);
  assert.equal(existsSync(path.join(root, target, 'index.html')), false);
});

test('explicit force resolves conflicts and establishes the next safe baseline', (t) => {
  const root = fixture(t);
  put(root, `${target}/index.html`, 'independent scene');
  put(root, `${target}/personal.dat`, 'extra data');
  success(sync(root, '--force'));
  assert.equal(existsSync(path.join(root, target, 'personal.dat')), false);
  put(root, `${source}/index.html`, 'later scene');
  success(sync(root));
  assert.equal(readFileSync(path.join(root, target, 'index.html'), 'utf8'), 'later scene');
});

test('read-only sync check reports conflicts without creating a baseline or copying', (t) => {
  const root = fixture(t);
  success(sync(root, '--check'));
  assert.equal(existsSync(path.join(root, manifest)), false);
  assert.equal(existsSync(path.join(root, target)), false);
  put(root, `${target}/index.html`, 'conflict');
  failure(sync(root, '--check'), /index\.html/);
});

test('mirror verification rejects extra, missing and line-ending-different files', (t) => {
  const root = fixture(t);
  put(root, `${source}/index.html`, 'scene\n');
  success(sync(root));
  success(run(root, 'verify-stellar-sync.mjs'));
  put(root, `${target}/extra.dat`, 'extra');
  failure(run(root, 'verify-stellar-sync.mjs'), /extra\.dat/);
  rmSync(path.join(root, target, 'extra.dat'));
  put(root, `${target}/index.html`, 'scene\r\n');
  failure(run(root, 'verify-stellar-sync.mjs'), /index\.html/);
  rmSync(path.join(root, target, 'index.html'));
  failure(run(root, 'verify-stellar-sync.mjs'), /index\.html/);
});

test('invalid manifest cannot authorize overwrites', (t) => {
  const root = fixture(t);
  success(sync(root));
  put(root, manifest, '{"version":1,"files":{"../outside":{"sha256":"wrong"}}}');
  failure(sync(root), /manifest/i);
});

const buildScript = path.join(scripts, 'build-android-embedded.mjs');
const bundlePath = 'android/app/src/main/assets/index.android.bundle';
const stages = ['check-assets', 'sync-stellar', 'resolve-entry', 'export-embed', 'verify-mirror', 'gradle', 'verify-apk'];

function storedApk(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const filename = Buffer.from(name);
    const bytes = Buffer.from(data);
    let crc = 0xFFFFFFFF;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
    }
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034B50);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE((crc ^ 0xFFFFFFFF) >>> 0, 14);
    header.writeUInt32LE(bytes.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(filename.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014B50);
    directory.writeUInt16LE(20, 4);
    header.copy(directory, 6, 4, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, filename);
    locals.push(header, filename, bytes);
    offset += 30 + filename.length + bytes.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

function runtimeFixture(root) {
  const names = [
    'stellarium-web-engine.js',
    'stellarium-web-engine.wasm',
    'fonts/Roboto-Regular.ttf',
    'fonts/Roboto-Bold.ttf',
    'data/stars/properties',
    'data/dso/properties',
    'data/skycultures/western/index.json',
    'data/meteor-showers.json',
    'data/landscapes/guereins/Norder2/Dir0/Npix0.webp',
    'landscapes.json',
    ...['winterfield', 'champagne_castle', 'kloppenheim', 'garching', 'ocean'].map(name => `data/landscapes/${name}/properties`),
  ];
  const entries = [['assets/stellar/index.html', 'original scene'], ['assets/index.android.bundle', 'current bundle']];
  for (const name of names) {
    put(root, `${source}/${name}`, 'fixture data');
    entries.push([`assets/stellar/${name}`, 'fixture data']);
  }
  const font = Buffer.alloc(28);
  font.writeUInt16BE(1, 4);
  font.write('glyf', 12);
  put(root, `${source}/fonts/NotoSansSC-Subset.ttf`, font);
  entries.push(['assets/stellar/fonts/NotoSansSC-Subset.ttf', font]);
  put(root, 'fixture.apk', storedApk(entries));
}

function exporterFixture(root) {
  put(root, 'package.json', JSON.stringify({ main: 'expo-router/entry' }));
  put(root, 'node_modules/expo/package.json', '{"name":"expo","main":"index.js"}');
  put(root, 'node_modules/expo/index.js', '');
  put(root, 'node_modules/expo-router/entry.js', '// fixture entry');
  put(root, 'node_modules/expo/scripts/resolveAppEntry.js', `
    console.log(require('node:path').join(process.argv[1], 'node_modules/expo-router/entry.js'));
  `);
  put(root, 'node_modules/@expo/cli/package.json', '{"name":"@expo/cli","main":"index.js"}');
  put(root, 'node_modules/@expo/cli/index.js', `
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const path = require('node:path');
    const args = process.argv.slice(2);
    const value = flag => args[args.indexOf(flag) + 1];
    assert.equal(args[0], 'export:embed');
    assert.ok(args.includes('--eager'));
    assert.equal(value('--platform'), 'android');
    assert.equal(value('--dev'), 'false');
    assert.equal(value('--minify'), 'true');
    assert.equal(value('--entry-file'), path.join(process.cwd(), 'node_modules/expo-router/entry.js'));
    assert.equal(value('--assets-dest'), path.join(process.cwd(), 'android/app/src/main/res'));
    assert.equal(value('--bundle-output'), path.join(process.cwd(), '${bundlePath}'));
    if (process.env.FIXTURE_MODE !== 'no-bundle') {
      fs.mkdirSync(path.dirname(value('--bundle-output')), { recursive: true });
      fs.writeFileSync(value('--bundle-output'), 'current bundle');
    }
    if (process.env.FIXTURE_MODE === 'mirror-drift')
      fs.writeFileSync(path.join(process.cwd(), '${target}/index.html'), 'target edit');
  `);
}

function buildFixture(t) {
  assert.ok(existsSync(buildScript), 'one-click build orchestration must exist');
  const root = fixture(t);
  runtimeFixture(root);
  exporterFixture(root);
  put(root, 'android/gradle/wrapper/gradle-wrapper.jar', 'fixture wrapper (never executed)');
  put(root, 'fake-gradle.cjs', `
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.dirname(process.cwd());
    const buildDir = path.join(root, '输出 gradle');
    const output = path.join(buildDir, 'outputs/apk/debug');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(process.env.WIFICAMERA_BUILD_INFO, JSON.stringify({ buildDir }));
    if (process.env.FIXTURE_MODE !== 'no-metadata')
      fs.writeFileSync(path.join(output, 'output-metadata.json'), JSON.stringify({
        version: 3, artifactType: { type: 'APK', kind: 'Directory' }, variantName: 'debug',
        elements: [{ type: 'SINGLE', filters: [], outputFile: '自定义 debug.apk' }]
      }));
    if (process.env.FIXTURE_MODE !== 'no-apk')
      fs.copyFileSync(path.join(root, 'fixture.apk'), path.join(output, '自定义 debug.apk'));
    if (process.env.FIXTURE_MODE === 'input-drift')
      fs.writeFileSync(path.join(root, '${source}/index.html'), 'source changed during Gradle');
  `);
  put(root, 'driver.mjs', `
    import fs, { appendFileSync } from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    import path from 'node:path';
    import { pathToFileURL } from 'node:url';
    if (process.env.FIXTURE_MODE === 'cross-device-backup') {
      const originalRename = fs.renameSync;
      fs.renameSync = (from, to) => {
        if (path.dirname(from) !== path.dirname(to))
          throw Object.assign(new Error('Cross-device rename is forbidden'), { code: 'EXDEV' });
        return originalRename(from, to);
      };
      syncBuiltinESMExports();
    }
    const api = await import(pathToFileURL(${JSON.stringify(buildScript)}));
    const root = process.cwd();
    const run = async spec => {
      appendFileSync(path.join(root, 'stages.jsonl'), JSON.stringify({ label: spec.label, command: spec.command, args: spec.args }) + '\\n');
      if (spec.label === process.env.FAIL_STAGE)
        return api.runCommand({ ...spec, command: process.execPath, args: ['-e', 'process.exit(31)'] });
      if (spec.label === 'gradle')
        return api.runCommand({ ...spec, command: process.execPath, args: [path.join(root, 'fake-gradle.cjs')] });
      return api.runCommand(spec);
    };
    try {
      await api.buildAndroidEmbedded({ root, ...JSON.parse(process.env.BUILD_OPTIONS || '{}') }, { run });
    } catch (error) {
      console.error(error.message);
      process.exitCode = error.exitCode ?? 1;
    }
  `);
  return root;
}

function buildRun(root, environment = {}) {
  return spawnSync(process.execPath, [path.join(root, 'driver.mjs')], {
    cwd: root,
    env: { ...process.env, JAVA_HOME: path.join(root, 'Java 中文 空格'), ...environment },
    encoding: 'utf8',
    timeout: 30000,
  });
}

function executed(root) {
  return readFileSync(path.join(root, 'stages.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
}

test('one command exports the configured entry then verifies the metadata-selected APK and receipt', (t) => {
  const root = buildFixture(t);
  success(buildRun(root));
  const commands = executed(root);
  assert.deepEqual(commands.map(item => item.label), stages);
  assert.ok(commands.every(item => !item.args.includes('--force')));
  const gradle = commands.find(item => item.label === 'gradle');
  assert.equal(gradle.command, path.join(root, 'Java 中文 空格', 'bin', process.platform === 'win32' ? 'java.exe' : 'java'));
  assert.ok(gradle.args.includes(':app:assembleDebug'));
  assert.ok(gradle.args.includes(path.join(root, 'android/gradle/wrapper/gradle-wrapper.jar')));
  const apk = path.join(root, '输出 gradle/outputs/apk/debug/自定义 debug.apk');
  const receipt = JSON.parse(readFileSync(`${apk}.receipt.json`, 'utf8'));
  assert.equal(receipt.apk, apk);
  assert.equal(receipt.bundleSha256, hash('current bundle'));
  assert.equal(receipt.stellarIndexSha256, hash('original scene'));
});

for (const [index, stage] of stages.entries()) {
  test(`a real exit 31 at ${stage} stops all following stages`, (t) => {
    const root = buildFixture(t);
    const result = buildRun(root, { FAIL_STAGE: stage });
    assert.equal(result.status, 31, result.stderr);
    assert.deepEqual(executed(root).map(item => item.label), stages.slice(0, index + 1));
    assert.equal(existsSync(path.join(root, '输出 gradle/outputs/apk/debug/自定义 debug.apk.receipt.json')), false);
  });
}

for (const [mode, lastStage, pattern] of [
  ['no-bundle', 'export-embed', /bundle/i],
  ['mirror-drift', 'verify-mirror', /index\.html/],
  ['no-apk', 'gradle', /APK|apk/],
  ['no-metadata', 'gradle', /metadata/i],
  ['input-drift', 'verify-apk', /changed/i],
]) {
  test(`zero exit with ${mode} still fails without accepting an old artifact`, (t) => {
    const root = buildFixture(t);
    put(root, bundlePath, 'old bundle');
    const result = buildRun(root, { FIXTURE_MODE: mode });
    failure(result, pattern);
    assert.equal(executed(root).at(-1).label, lastStage);
    assert.equal(existsSync(path.join(root, '输出 gradle/outputs/apk/debug/自定义 debug.apk.receipt.json')), false);
    if (mode === 'no-bundle')
      assert.equal(readFileSync(path.join(root, bundlePath), 'utf8'), 'old bundle');
  });
}

test('build refuses independent target edits without invoking export or Gradle', (t) => {
  const root = buildFixture(t);
  put(root, `${target}/index.html`, 'user changed target');
  failure(buildRun(root), /index\.html/);
  assert.deepEqual(executed(root).map(item => item.label), ['check-assets', 'sync-stellar']);
  assert.equal(readFileSync(path.join(root, target, 'index.html'), 'utf8'), 'user changed target');
});

test('explicit APK output works without conventional metadata placement', (t) => {
  const root = buildFixture(t);
  const apk = path.join(root, '输出 gradle/outputs/apk/debug/自定义 debug.apk');
  success(buildRun(root, { FIXTURE_MODE: 'no-metadata', BUILD_OPTIONS: JSON.stringify({ apk }) }));
  assert.ok(existsSync(`${apk}.receipt.json`));
});

test('prebuild sync does not create a partial Android project before native generation', (t) => {
  const root = fixture(t);
  rmSync(path.join(root, 'android'), { recursive: true });
  success(sync(root));
  assert.equal(existsSync(path.join(root, 'android')), false);
});

test('safe source directory-to-file changes remove only obsolete mirrored entries', (t) => {
  const root = fixture(t);
  put(root, `${source}/changing/old.dat`, 'old data');
  success(sync(root));
  rmSync(path.join(root, source, 'changing'), { recursive: true });
  put(root, `${source}/changing`, 'now a file');
  success(sync(root));
  assert.equal(readFileSync(path.join(root, target, 'changing'), 'utf8'), 'now a file');
});

test('bundle backup supports project and OS temp directories on different volumes', (t) => {
  const root = buildFixture(t);
  put(root, bundlePath, 'previous bundle');
  success(buildRun(root, { FIXTURE_MODE: 'cross-device-backup' }));
  assert.equal(readFileSync(path.join(root, bundlePath), 'utf8'), 'current bundle');
});

test('process runner preserves arguments in Chinese/space paths and reports spawn errors', async (t) => {
  assert.ok(existsSync(buildScript), 'one-click build orchestration must exist');
  const api = await import(new URL('./build-android-embedded.mjs', import.meta.url));
  const root = fixture(t);
  const command = put(root, '中文 脚本.mjs', 'console.log(JSON.stringify(process.argv.slice(2)));');
  const result = await api.runCommand({ label: 'arguments', command: process.execPath, args: [command, '中文 空格', 'a&b'], cwd: root, capture: true });
  assert.deepEqual(JSON.parse(result.stdout), ['中文 空格', 'a&b']);
  await assert.rejects(api.runCommand({ label: 'missing-tool', command: path.join(root, 'absent.exe'), args: [], cwd: root }), /missing-tool/);
});

function compositeFixture(t, withApp = true) {
  const root = mkdtempSync(path.join(tmpdir(), 'composite-gradle-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const wrapperDir = path.join(root, 'gradle/wrapper');
  mkdirSync(wrapperDir, { recursive: true });
  copyFileSync(path.resolve(scripts, '../android/gradle/wrapper/gradle-wrapper.jar'), path.join(wrapperDir, 'gradle-wrapper.jar'));
  copyFileSync(path.resolve(scripts, '../android/gradle/wrapper/gradle-wrapper.properties'), path.join(wrapperDir, 'gradle-wrapper.properties'));
  writeFileSync(path.join(root, 'settings.gradle'), `rootProject.name = 'fixture-root'\n${withApp ? "include ':app'\n" : ''}includeBuild 'included'\n`);
  if (withApp) {
    mkdirSync(path.join(root, 'app'), { recursive: true });
    writeFileSync(path.join(root, 'app/build.gradle'), '');
  }
  mkdirSync(path.join(root, 'included'), { recursive: true });
  writeFileSync(path.join(root, 'included/settings.gradle'), "rootProject.name = 'fixture-included'\n");
  return root;
}

test('generated embedded-output.gradle safely handles included builds without missing app failure', async (t) => {
  const javaHome = process.env.JAVA_HOME?.replace(/^"|"$/g, '').trim();
  const java = javaHome ? path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : null;
  if (!process.env.TEST_REAL_GRADLE || !java || !existsSync(java)) {
    t.skip('requires TEST_REAL_GRADLE=1 and valid JAVA_HOME');
    return;
  }
  const root = buildFixture(t);
  const api = await import(new URL('./build-android-embedded.mjs', import.meta.url));
  const capturedScript = path.join(tmpdir(), `captured-embedded-output-${Date.now()}.gradle`);
  t.after(() => rmSync(capturedScript, { force: true }));

  try {
    await api.buildAndroidEmbedded({ root }, {
      run: async (spec) => {
        if (spec.label === 'gradle') {
          copyFileSync(spec.args[spec.args.indexOf('--init-script') + 1], capturedScript);
          throw new Error('INIT_SCRIPT_CAPTURED');
        }
        return api.runCommand(spec);
      },
    });
  } catch (error) {
    if (error.message !== 'INIT_SCRIPT_CAPTURED') throw error;
  }
  assert.ok(existsSync(capturedScript), 'captured generated init script must exist');

  const compositeRoot = compositeFixture(t, true);
  const infoFile = path.join(compositeRoot, 'gradle-info.json');
  const jar = path.join(compositeRoot, 'gradle/wrapper/gradle-wrapper.jar');
  const compositeResult = spawnSync(java, ['-jar', jar, 'help', '--init-script', capturedScript], {
    cwd: compositeRoot,
    env: { ...process.env, WIFICAMERA_BUILD_INFO: infoFile },
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(compositeResult.status, 0, `composite build failed: ${compositeResult.stderr}\n${compositeResult.stdout}`);
  const output = JSON.parse(readFileSync(infoFile, 'utf8'));
  assert.equal(output.buildDir, path.join(compositeRoot, 'app/build'));

  const missingRoot = compositeFixture(t, false);
  const missingResult = spawnSync(java, ['-jar', path.join(missingRoot, 'gradle/wrapper/gradle-wrapper.jar'), 'help', '--init-script', capturedScript], {
    cwd: missingRoot,
    env: { ...process.env, WIFICAMERA_BUILD_INFO: path.join(missingRoot, 'gradle-info.json') },
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.notEqual(missingResult.status, 0, 'build without :app must fail');
  assert.match(missingResult.stderr, /Missing :app project/);
});

