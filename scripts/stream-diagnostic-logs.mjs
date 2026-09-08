import { spawn } from 'node:child_process';
import readline from 'node:readline';

const DIAGNOSTIC_TAG = 'WIFICAMERA_DIAGNOSTIC';
const SERIAL_PATTERN = /^[\w.:-]+$/;

function streamFilteredLines(input, output) {
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  lines.on('line', (line) => {
    if (line.includes(DIAGNOSTIC_TAG))
      output.write(`${line}\n`);
  });
}

function parseSerial(args) {
  const serial = args[0];
  if (!serial)
    return undefined;
  if (!SERIAL_PATTERN.test(serial))
    throw new Error(`Invalid ADB serial: ${serial}`);
  return serial;
}

const args = process.argv.slice(2);
if (args[0] === '--filter-stdin') {
  streamFilteredLines(process.stdin, process.stdout);
}
else {
  let serial;
  try {
    serial = parseSerial(args);
  }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }

  if (process.exitCode !== 1) {
    const adbArgs = [
      ...(serial ? ['-s', serial] : []),
      'logcat',
      '-v',
      'time',
      'ReactNativeJS:V',
      'ReactNative:V',
      '*:S',
    ];
    console.log(`正在监听 ${serial ?? '默认设备'} 的 WifiCamera 诊断日志，按 Ctrl+C 停止。`);
    const child = spawn(process.env.ADB ?? 'adb', adbArgs, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    streamFilteredLines(child.stdout, process.stdout);
    child.stderr.pipe(process.stderr);
    child.on('error', (error) => {
      console.error(`无法启动 adb logcat：${error.message}`);
      process.exitCode = 1;
    });
    child.on('exit', (code) => {
      if (code && code !== 0)
        process.exitCode = code;
    });
    process.once('SIGINT', () => child.kill('SIGINT'));
  }
}
