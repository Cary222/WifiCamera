import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_PACKAGE = 'com.wificamera.development';
const DEVICE_LOG_PATH = 'files/diagnostics/connection-errors.log';
const SERIAL_PATTERN = /^[\w.:-]+$/;
const PACKAGE_PATTERN = /^[a-z][\w.]+$/i;

function validate(value, pattern, label) {
  if (value && !pattern.test(value))
    throw new Error(`Invalid ${label}: ${value}`);
}

function buildAdbArgs(serial, packageName) {
  return [
    ...(serial ? ['-s', serial] : []),
    'exec-out',
    'run-as',
    packageName,
    'cat',
    DEVICE_LOG_PATH,
  ];
}

const args = process.argv.slice(2);
const printCommand = args[0] === '--print-command';
const serial = printCommand ? args[1] : args[0];
const packageName = process.env.WIFICAMERA_APP_ID ?? DEFAULT_PACKAGE;

try {
  validate(serial, SERIAL_PATTERN, 'ADB serial');
  validate(packageName, PACKAGE_PATTERN, 'Android package name');
  const adbArgs = buildAdbArgs(serial, packageName);

  if (printCommand) {
    process.stdout.write(`${JSON.stringify(adbArgs)}\n`);
  }
  else {
    const contents = execFileSync(process.env.ADB ?? 'adb', adbArgs, {
      maxBuffer: 2 * 1024 * 1024,
      shell: false,
    });
    const outputDirectory = path.resolve(process.cwd(), 'logs');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(outputDirectory, `connection-errors-${timestamp}.log`);
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(outputPath, contents);
    console.log(`诊断日志已保存到：${outputPath}`);
  }
}
catch (error) {
  const details = error instanceof Error ? error.message : String(error);
  console.error(`拉取诊断日志失败：${details}`);
  console.error('请确认设备在线、安装的是可调试包，并且 App 至少产生过一条警告或错误日志。');
  process.exitCode = 1;
}
