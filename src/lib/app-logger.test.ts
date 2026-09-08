import type { AppLogEntry } from './app-logger';

const mockFiles = new Map<string, string>();

const mockReadAsStringAsync = jest.fn(async (uri: string) => {
  const value = mockFiles.get(uri);
  if (value === undefined)
    throw new Error('File not found');
  return value;
});
const mockWriteAsStringAsync = jest.fn(async (uri: string, contents: string) => {
  mockFiles.set(uri, contents);
});
const mockMakeDirectoryAsync = jest.fn(async () => undefined);
const mockDeleteAsync = jest.fn(async (uri: string) => {
  mockFiles.delete(uri);
});

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///app/',
  cacheDirectory: 'file:///cache/',
  readAsStringAsync: mockReadAsStringAsync,
  writeAsStringAsync: mockWriteAsStringAsync,
  makeDirectoryAsync: mockMakeDirectoryAsync,
  deleteAsync: mockDeleteAsync,
}));

const LOG_URI = 'file:///app/diagnostics/connection-errors.log';

function loadLogger() {
  jest.resetModules();
  return require('./app-logger');
}

describe('appLogger diagnostic persistence', () => {
  beforeEach(() => {
    mockFiles.clear();
    jest.clearAllMocks();
  });

  it('persists warn and error entries with sensitive fields redacted', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { appLogger } = await loadLogger();

    await appLogger.ready();
    appLogger.error('WS', '连接失败', {
      authorization: 'Bearer secret-token',
      nested: { password: '12345678' },
      url: 'ws://192.168.1.1/ws?token=query-secret&mode=live',
    });
    await appLogger.flush();

    const persisted = mockFiles.get(LOG_URI) ?? '';
    expect(persisted).toContain('连接失败');
    expect(persisted).toContain('[REDACTED]');
    expect(persisted).not.toContain('secret-token');
    expect(persisted).not.toContain('12345678');
    expect(persisted).not.toContain('query-secret');
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('WIFICAMERA_DIAGNOSTIC'));

    consoleError.mockRestore();
  });

  it('restores valid persisted entries without discarding new session entries', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFiles.set(LOG_URI, [
      JSON.stringify({ timestamp: 100, level: 'warn', scope: 'WS', message: '旧连接中断' }),
      'not-json',
    ].join('\n'));
    const { appLogger } = await loadLogger();

    appLogger.error('WHEP', '新协商失败');
    await appLogger.ready();

    expect(appLogger.getSnapshot().map((entry: AppLogEntry) => entry.message)).toEqual([
      '旧连接中断',
      '新协商失败',
    ]);

    consoleError.mockRestore();
  });

  it('rotates persisted diagnostics to the most recent 200 entries', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { appLogger } = await loadLogger();

    await appLogger.ready();
    for (let index = 0; index < 205; index += 1)
      appLogger.error('WS', `event-${index}`);
    await appLogger.flush();

    const lines = (mockFiles.get(LOG_URI) ?? '').split('\n').filter(Boolean);
    expect(lines).toHaveLength(200);
    expect(lines[0]).toContain('event-5');
    expect(lines.at(-1)).toContain('event-204');

    consoleError.mockRestore();
  });

  it('formats diagnostics and writes a shareable export file', async () => {
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { appLogger } = await loadLogger();

    await appLogger.ready();
    appLogger.warn('WS', '控制通道已断开', { code: 1006 });
    const exportText = appLogger.getExportText();
    const exportUri = await appLogger.createExportFile();

    expect(exportText).toContain('WARN [WS] 控制通道已断开');
    expect(exportText).toContain('{"code":1006}');
    expect(exportUri).toBe('file:///cache/wificamera-diagnostic.log');
    expect(mockFiles.get(exportUri)).toBe(exportText);

    consoleWarn.mockRestore();
  });

  it('clears both in-memory and persisted diagnostics', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { appLogger } = await loadLogger();

    await appLogger.ready();
    appLogger.error('WS', '连接失败');
    await appLogger.flush();
    appLogger.clear();
    await appLogger.flush();

    expect(appLogger.getSnapshot()).toEqual([]);
    expect(mockFiles.has(LOG_URI)).toBe(false);

    consoleError.mockRestore();
  });
});
