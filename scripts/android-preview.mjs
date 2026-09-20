import { createHash, randomBytes, X509Certificate } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { writeJsonAtomic } from './sync-stellar-assets.mjs';

export const PREVIEW_PACKAGE = 'com.wificamera.preview';
export const PREVIEW_ARCHES = ['armeabi-v7a', 'arm64-v8a'];

// Only the preview invocation applies this overlay; ignored native files stay untouched.
export const PREVIEW_GRADLE_SETUP = `
gradle.beforeProject { p ->
  if (gradle.parent != null || p.path != ':app') return
  p.pluginManager.withPlugin('com.facebook.react') {
    // The shared script already exports fresh --dev false JS and assets eagerly.
    // This skips a SECOND export, not Android's release/debuggable flag.
    p.extensions.getByName('react').debuggableVariants.add('release')
  }
  p.pluginManager.withPlugin('com.android.application') {
    p.androidComponents.finalizeDsl { android ->
      android.defaultConfig.applicationId = '${PREVIEW_PACKAGE}'
      android.defaultConfig.versionCode = System.getenv('WIFICAMERA_PREVIEW_VERSION').toInteger()
      def signing = android.signingConfigs.maybeCreate('internalPreview')
      signing.storeFile = new File(System.getenv('WIFICAMERA_PREVIEW_KEYSTORE'))
      signing.storePassword = System.getenv('WIFICAMERA_PREVIEW_PASSWORD')
      signing.keyAlias = 'wificamera-preview'
      signing.keyPassword = System.getenv('WIFICAMERA_PREVIEW_PASSWORD')
      signing.storeType = 'PKCS12'
      android.buildTypes.release.signingConfig = signing
      android.buildTypes.release.debuggable = false
      android.sourceSets.release.manifest.srcFile(System.getenv('WIFICAMERA_PREVIEW_MANIFEST'))
    }
  }
}
`;

/** Keep machine tooling, but never bake a developer's public .env into a shared APK. */
export function previewEnvironment(original) {
  const env = Object.fromEntries(Object.entries(original).filter(([name]) => !name.startsWith('EXPO_PUBLIC_')));
  return {
    ...env,
    NODE_ENV: 'production',
    EXPO_NO_DOTENV: '1',
    WIFICAMERA_STANDALONE_BUILD: '1',
    EXPO_PUBLIC_APP_ENV: 'preview',
    EXPO_PUBLIC_CAMERA_BASE_URL: 'http://192.168.1.1:8999',
    EXPO_PUBLIC_CAMERA_WHEP_URL: 'http://192.168.1.1:8889/cam0/whep',
  };
}

export function nextPreviewVersion(previous = 0, now = Date.now()) {
  if (!Number.isSafeInteger(previous) || previous < 0)
    throw new Error('Invalid previous preview versionCode');
  const value = Math.max(previous + 1, Math.floor((now - Date.UTC(2026, 0, 1)) / 60000));
  if (!Number.isSafeInteger(value) || value < 1 || value > 2100000000)
    throw new Error('Preview versionCode is out of Android range');
  return value;
}

/** Use the actual APK's aapt2 output, not just source Gradle settings. */
export function validatePreviewInspection({ badging, manifest, versionCode, arches }) {
  if (!badging.includes(`package: name='${PREVIEW_PACKAGE}'`))
    throw new Error('Unexpected preview package');
  if (!badging.includes(`versionCode='${versionCode}'`))
    throw new Error('Unexpected preview versionCode');
  if (/application-debuggable/.test(badging) || /android:debuggable[^\n]*=(?:true|\(type 0x12\)0xffffffff)\b/.test(manifest))
    throw new Error('Preview APK must not be debuggable');
  if (!/launchable-activity: name='[^']+\.MainActivity'/.test(badging))
    throw new Error('Preview launcher is not MainActivity');
  if (/expo\.modules\.devlauncher\.[^\n]*Activity/.test(manifest))
    throw new Error('Development launcher activity is still present');
  const metadata = manifest.split(/\n\s*E: /).find(block => block.startsWith('meta-data') && block.includes('"expo.modules.updates.ENABLED"'));
  if (!metadata || !/android:value[^\n]*=(?:false|\(type 0x12\)0x0)\b/.test(metadata))
    throw new Error('Preview must disable Expo updates and load its bundled code');
  const native = badging.split('\n').find(line => line.startsWith('native-code:')) ?? '';
  for (const arch of arches) {
    if (!native.includes(`'${arch}'`))
      throw new Error(`Preview is missing native ABI ${arch}`);
  }
}

export async function preparePreview(context, temporary) {
  const { root, run } = context;
  const env = context.env;
  const javaHome = env.JAVA_HOME || [
    path.join(env.ProgramFiles || 'C:/Program Files', 'Android/Android Studio/jbr'),
    path.resolve(root, '../AndroidStudio/jbr'),
  ].find(dir => existsSync(path.join(dir, 'bin/java.exe')));
  if (!javaHome)
    throw new Error('Set JAVA_HOME to JDK 17 or newer before building a preview');
  env.JAVA_HOME = javaHome.replace(/^"|"$/g, '');
  const java = path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  const keytool = path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool');
  const directory = path.join(homedir(), '.wificamera', 'preview-signing');
  mkdirSync(directory, { recursive: true });
  const credentialsFile = path.join(directory, 'credentials.json');
  const keystore = path.join(directory, 'preview.p12');
  const hasCredentials = existsSync(credentialsFile);
  if (hasCredentials !== existsSync(keystore))
    throw new Error(`Incomplete preview signing state in ${directory}; restore its backup, do not replace the key`);
  const credentials = hasCredentials ? JSON.parse(readFileSync(credentialsFile, 'utf8')) : { password: randomBytes(32).toString('hex'), versionCode: 0 };
  if (!/^[a-f0-9]{64}$/.test(credentials.password))
    throw new Error('Invalid preview signing credentials');
  env.WIFICAMERA_PREVIEW_PASSWORD = credentials.password;
  if (!hasCredentials) {
    writeFileSync(credentialsFile, `${JSON.stringify(credentials)}\n`, { flag: 'wx', mode: 0o600 });
    await run({ label: 'preview-create-signing-key', command: keytool, args: ['-genkeypair', '-keystore', keystore, '-storetype', 'PKCS12', '-storepass:env', 'WIFICAMERA_PREVIEW_PASSWORD', '-keypass:env', 'WIFICAMERA_PREVIEW_PASSWORD', '-alias', 'wificamera-preview', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=WifiCamera Internal Preview', '-noprompt'], cwd: root, env });
  }
  const certificate = await run({ label: 'preview-signing-certificate', command: keytool, args: ['-exportcert', '-rfc', '-keystore', keystore, '-storepass:env', 'WIFICAMERA_PREVIEW_PASSWORD', '-alias', 'wificamera-preview'], cwd: root, env, capture: true });
  const fingerprint = new X509Certificate(certificate.stdout).fingerprint256.replaceAll(':', '').toLowerCase();
  const versionCode = nextPreviewVersion(credentials.versionCode);
  // Reserve before building so a retry never republishes the same version code.
  writeJsonAtomic(credentialsFile, { ...credentials, versionCode });
  const overlay = path.join(temporary, 'AndroidManifest.xml');
  if (existsSync(path.join(root, 'android/app/src/release/AndroidManifest.xml')))
    throw new Error('A custom release manifest exists; merge it explicitly before using the preview overlay');
  writeFileSync(overlay, `<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
  <application android:label="WifiCamera 内测" tools:replace="android:label">
    <meta-data android:name="expo.modules.updates.ENABLED" android:value="false" tools:replace="android:value" />
  </application>
</manifest>\n`);
  Object.assign(env, { WIFICAMERA_PREVIEW_VERSION: String(versionCode), WIFICAMERA_PREVIEW_KEYSTORE: keystore, WIFICAMERA_PREVIEW_MANIFEST: overlay });
  return { java, versionCode, fingerprint };
}

export async function finishPreview(context, { preview, apk, receipt, arches }) {
  const { root, env, run } = context;
  const toolsRoot = path.join(androidSdk(root, env), 'build-tools');
  const version = readdirSync(toolsRoot).filter(name => /^\d+\.\d+\.\d+$/.test(name)).sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))[0];
  if (!version)
    throw new Error('Install Android SDK build-tools before verifying the preview');
  const tools = path.join(toolsRoot, version);
  const aapt = path.join(tools, process.platform === 'win32' ? 'aapt2.exe' : 'aapt2');
  const inspect = async (label, command, args) => (await run({ label, command, args, cwd: root, env, capture: true })).stdout;
  const badging = await inspect('preview-inspect-package', aapt, ['dump', 'badging', apk]);
  const manifest = await inspect('preview-inspect-manifest', aapt, ['dump', 'xmltree', apk, '--file', 'AndroidManifest.xml']);
  validatePreviewInspection({ badging, manifest, versionCode: preview.versionCode, arches });
  const signature = await inspect('preview-verify-signature', preview.java, ['-jar', path.join(tools, 'lib/apksigner.jar'), 'verify', '--verbose', '--print-certs', apk]);
  const digest = signature.match(/Signer #1 certificate SHA-256 digest:\s*([a-f0-9]+)/i)?.[1].toLowerCase();
  if (digest !== preview.fingerprint)
    throw new Error('APK certificate does not match the persistent preview signing key');
  const output = path.join(root, 'builds', `WifiCamera-preview-${preview.versionCode}.apk`);
  mkdirSync(path.dirname(output), { recursive: true });
  if (existsSync(output))
    throw new Error(`Refusing to overwrite an existing distributed APK: ${output}`);
  copyFileSync(apk, output);
  if (createHash('sha256').update(readFileSync(output)).digest('hex') !== receipt.apkSha256)
    throw new Error('Preview APK changed between verification and copying');
  const result = { ...receipt, apk: output, package: PREVIEW_PACKAGE, variant: 'release', versionCode: preview.versionCode, signingCertificateSha256: digest, arches, debuggable: false, expoUpdatesEnabled: false, deviceTested: false };
  writeJsonAtomic(`${output}.receipt.json`, result);
  writeFileSync(`${output}.sha256`, `${receipt.apkSha256}  ${path.basename(output)}\n`);
  return result;
}

/** Resolve SDK from Android's existing local.properties without changing it. */
export function androidSdk(root, env) {
  const local = path.join(root, 'android/local.properties');
  const property = existsSync(local) ? readFileSync(local, 'utf8').match(/^sdk\.dir=(.+)$/m)?.[1].trim().replace(/\\([\\:])/g, '$1') : undefined;
  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT || property;
  if (!sdk || !existsSync(sdk))
    throw new Error('Set ANDROID_HOME or android/local.properties sdk.dir to the installed Android SDK');
  return sdk;
}
