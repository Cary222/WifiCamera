#!/usr/bin/env node
/** Build only: no installs, Metro termination, dependency installation or data clearing. */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { finishPreview, preparePreview, PREVIEW_ARCHES, PREVIEW_GRADLE_SETUP, previewEnvironment } from './android-preview.mjs';
import { projectRoot, writeJsonAtomic } from './sync-stellar-assets.mjs';
import { embeddedSnapshot } from './verify-embedded-apk.mjs';

const scripts = path.dirname(fileURLToPath(import.meta.url));

export function runCommand({ label, command, args, cwd, env = process.env, capture = false }) {
  console.log(`[embedded-build] ${label}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      stdio: ['inherit', capture ? 'pipe' : 'inherit', 'inherit'],
      windowsHide: true,
    });
    let stdout = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.once('error', (cause) => {
      reject(Object.assign(new Error(`${label}: ${cause.message}`), { exitCode: 1 }));
    });
    child.once('close', (code, signal) => {
      if (code !== 0 || signal)
        reject(Object.assign(new Error(`${label} failed (${signal ? `signal ${signal}` : `exit ${code}`})`), { exitCode: Number.isInteger(code) && code > 0 ? code : 1 }));
      else
        resolve({ stdout });
    });
  });
}

function requireFile(file, description) {
  if (!existsSync(file) || !statSync(file).isFile() || !statSync(file).size)
    throw new Error(`Missing / empty ${description}: ${file}`);
  return file;
}

async function exportBundle(context) {
  const { root, run, env } = context;
  const require = createRequire(path.join(root, 'package.json'));
  const expo = require.resolve('expo/package.json');
  const cli = require.resolve('@expo/cli', { paths: [expo] });
  const resolved = await run({
    label: 'resolve-entry',
    command: process.execPath,
    args: ['-e', 'require(\'expo/scripts/resolveAppEntry\')', root, 'android', 'absolute'],
    cwd: root,
    env,
    capture: true,
  });
  const entry = requireFile(resolved.stdout.trim(), 'Expo entry');
  const bundle = path.join(root, 'android/app/src/main/assets/index.android.bundle');
  // Keep renames on the project's volume, even when TEMP is on another drive.
  const backup = `${bundle}.${randomUUID()}.previous`;
  mkdirSync(path.dirname(bundle), { recursive: true });
  if (existsSync(bundle))
    renameSync(bundle, backup);
  try {
    await run({
      label: 'export-embed',
      command: process.execPath,
      args: [cli, 'export:embed', '--eager', '--platform', 'android', '--dev', 'false', '--minify', 'true', '--entry-file', entry, '--bundle-output', bundle, '--assets-dest', path.join(root, 'android/app/src/main/res')],
      cwd: root,
      env,
    });
    requireFile(bundle, 'freshly exported bundle');
    rmSync(backup, { force: true });
  }
  catch (error) {
    rmSync(bundle, { force: true });
    if (existsSync(backup))
      renameSync(backup, bundle);
    throw error;
  }
}

function metadataFiles(directory) {
  if (!existsSync(directory))
    return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory())
      return metadataFiles(file);
    return entry.isFile() && entry.name === 'output-metadata.json' ? [file] : [];
  });
}

export function selectApk({ apk, metadata, buildDir, variant = 'debug' }) {
  if (apk)
    return requireFile(path.resolve(apk), 'APK');
  const files = metadata ? [path.resolve(metadata)] : metadataFiles(path.join(buildDir, 'outputs/apk'));
  const candidates = [];
  for (const file of files) {
    const info = JSON.parse(readFileSync(file, 'utf8'));
    if (info.artifactType?.type !== 'APK' || info.variantName !== variant)
      continue;
    if (!Array.isArray(info.elements))
      throw new Error(`Invalid APK metadata: ${file}`);
    const universal = info.elements.filter(item => Array.isArray(item.filters) && item.filters.length === 0);
    for (const element of universal.length ? universal : info.elements) {
      if (typeof element.outputFile !== 'string' || !element.outputFile.endsWith('.apk'))
        throw new Error(`Invalid APK output in metadata: ${file}`);
      const output = path.resolve(path.dirname(file), element.outputFile);
      const relative = path.relative(path.dirname(file), output);
      if (relative.startsWith('..') || path.isAbsolute(relative))
        throw new Error(`APK metadata output escapes its directory: ${file}`);
      candidates.push(output);
    }
  }
  const unique = [...new Set(candidates)];
  if (unique.length !== 1)
    throw new Error(`Expected one ${variant} APK in output metadata, found ${unique.length}; use --apk or --metadata explicitly.`);
  return requireFile(unique[0], 'APK');
}

async function assemble(context, temporary, options = {}) {
  const { root, run, env } = context;
  if (options.arch && !/^[\w,-]+$/.test(options.arch))
    throw new Error(`Invalid architecture filter: ${options.arch}`);
  const infoFile = path.join(temporary, 'gradle-output.json');
  const initScript = path.join(temporary, 'embedded-output.gradle');
  writeFileSync(initScript, `
    ${options.standalone ? PREVIEW_GRADLE_SETUP : ''}
    gradle.projectsEvaluated {
      // Init scripts also run in included builds, which do not own this APK.
      if (gradle.parent != null) return
      def app = gradle.rootProject.findProject(':app')
      if (app == null) throw new GradleException('Missing :app project')
      def destination = new File(System.getenv('WIFICAMERA_BUILD_INFO'))
      destination.text = groovy.json.JsonOutput.toJson([buildDir: app.layout.buildDirectory.get().asFile.absolutePath])
    }
  `);
  const javaHome = env.JAVA_HOME?.replace(/^"|"$/g, '').trim();
  const java = javaHome ? path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
  const wrapper = requireFile(path.join(root, 'android/gradle/wrapper/gradle-wrapper.jar'), 'Gradle wrapper');
  const archArgs = options.arch ? [`-PreactNativeArchitectures=${options.arch}`] : [];
  // Invoke the same wrapper JAR as gradlew.bat; avoid cmd quoting/encoding entirely.
  await run({
    label: 'gradle',
    command: java,
    args: ['-Xmx64m', '-jar', wrapper, options.standalone ? ':app:assembleRelease' : ':app:assembleDebug', '--init-script', initScript, ...archArgs],
    cwd: path.join(root, 'android'),
    env: { ...env, WIFICAMERA_BUILD_INFO: infoFile },
  });
  return infoFile;
}

export async function buildAndroidEmbedded(options = {}, { run = runCommand } = {}) {
  const root = path.resolve(options.root ?? projectRoot);
  const context = { root, run, env: options.standalone ? previewEnvironment(process.env) : process.env };
  if (options.standalone) {
    if (options.apk || options.metadata || options.buildDir)
      throw new Error('Standalone builds must select their own fresh release output, not an explicit APK');
    options = { ...options, arch: options.arch || PREVIEW_ARCHES.join(',') };
  }
  const nodeStep = (label, script, args = []) => run({
    label,
    command: process.execPath,
    args: [path.join(scripts, script), ...args],
    cwd: root,
    env: context.env,
  });
  await nodeStep('check-assets', 'check-stellarium-assets.mjs');
  await nodeStep('sync-stellar', 'sync-stellar-assets.mjs', ['--root', root]);
  const temporary = mkdtempSync(path.join(tmpdir(), 'wificamera-embedded-'));
  try {
    const preview = options.standalone ? await preparePreview(context, temporary) : null;
    await exportBundle(context);
    await nodeStep('verify-mirror', 'verify-stellar-sync.mjs', ['--root', root]);
    const expected = path.join(temporary, 'expected.json');
    writeJsonAtomic(expected, embeddedSnapshot(root));
    const infoFile = await assemble(context, temporary, options);
    const buildDir = options.buildDir ?? (options.apk || options.metadata ? undefined : JSON.parse(readFileSync(requireFile(infoFile, 'Gradle buildDir metadata'), 'utf8')).buildDir);
    if (!options.apk && !options.metadata && (typeof buildDir !== 'string' || !path.isAbsolute(buildDir)))
      throw new Error('Gradle did not report an absolute buildDir');
    const apk = selectApk({ ...options, buildDir, variant: options.standalone ? 'release' : 'debug' });
    const receipt = path.join(temporary, 'receipt.json');
    await nodeStep('verify-apk', 'verify-embedded-apk.mjs', ['--root', root, '--apk', apk, '--expected', expected, '--receipt', receipt]);
    const result = JSON.parse(readFileSync(requireFile(receipt, 'APK verification receipt'), 'utf8'));
    const finalResult = preview ? await finishPreview(context, { preview, apk, receipt: result, arches: options.arch.split(',') }) : result;
    const outputReceipt = options.receipt ? path.resolve(options.receipt) : `${finalResult.apk}.receipt.json`;
    writeJsonAtomic(outputReceipt, finalResult);
    console.log(`[embedded-build] Verified APK: ${finalResult.apk}\n[embedded-build] Receipt: ${outputReceipt}`);
    return finalResult;
  }
  finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      'root': { type: 'string' },
      'apk': { type: 'string' },
      'metadata': { type: 'string' },
      'build-dir': { type: 'string' },
      'receipt': { type: 'string' },
      'arch': { type: 'string' },
      'help': { type: 'boolean' },
      'standalone': { type: 'boolean' },
    } });
    if (values.help)
      console.log('Build an embedded APK (never installs). Use --standalone for a signed, offline Release preview in builds/ (defaults to both phone ARM ABIs); otherwise builds Debug. Options: --root <project>, --apk <file>, --metadata <output-metadata.json>, --build-dir <metadata search directory>, --receipt <file>, --arch <arm64-v8a|armeabi-v7a|x86|x86_64>. Preview signing is kept in ~/.wificamera/preview-signing: back up this directory privately for future updates. Conflicts require explicit resolution with sync:stellar; this command never forces sync.');
    else
      await buildAndroidEmbedded({ ...values, buildDir: values['build-dir'] && path.resolve(values['build-dir']) });
  }
  catch (error) {
    console.error(`[embedded-build] ${error.message}`);
    process.exitCode = error.exitCode ?? 1;
  }
}
