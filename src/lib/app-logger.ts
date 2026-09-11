import * as FileSystem from 'expo-file-system/legacy';

export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type AppLogEntry = {
  id: number;
  timestamp: number;
  level: AppLogLevel;
  scope: string;
  message: string;
  details?: string;
};

type PersistedLogEntry = Omit<AppLogEntry, 'id'>;

type AppLogPayload = {
  scope: string;
  message: string;
  details?: unknown;
};

const MAX_LOG_ENTRIES = 500;
const MAX_PERSISTED_LOG_ENTRIES = 200;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_DETAILS_LENGTH = 4000;
const MAX_PERSISTED_BYTES = 512 * 1024;
const REDACTED = '[REDACTED]';
const SENSITIVE_KEY_PATTERN = /authorization|cookie|password|passwd|secret|session|token|api[-_]?key/i;
const INLINE_SECRET_PATTERN = /((?:authorization|cookie|password|passwd|secret|session|token|api[-_]?key)\s*[=:]\s*)([^&\s,;]+)/gi;
const BEARER_TOKEN_PATTERN = /(Bearer\s+)[\w.~+/=-]+/gi;

const diagnosticsDirectoryUri = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}diagnostics/`
  : null;
const diagnosticsFileUri = diagnosticsDirectoryUri
  ? `${diagnosticsDirectoryUri}connection-errors.log`
  : null;

let nextId = 1;
let entries: AppLogEntry[] = [];
let clearRevision = 0;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach(listener => listener());
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`;
}

function redactString(value: string): string {
  return value
    .replace(BEARER_TOKEN_PATTERN, `$1${REDACTED}`)
    .replace(INLINE_SECRET_PATTERN, `$1${REDACTED}`);
}

function sanitizeDetails(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string')
    return truncate(redactString(value), MAX_DETAILS_LENGTH);
  if (value === null || typeof value !== 'object')
    return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncate(redactString(value.message), MAX_DETAILS_LENGTH),
      stack: value.stack ? truncate(redactString(value.stack), MAX_DETAILS_LENGTH) : undefined,
    };
  }
  if (seen.has(value))
    return '[Circular]';
  seen.add(value);
  if (Array.isArray(value))
    return value.slice(0, 50).map(item => sanitizeDetails(item, seen));

  return Object.fromEntries(
    Object.entries(value).slice(0, 50).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : sanitizeDetails(item, seen),
    ]),
  );
}

function serializeDetails(details: unknown): string | undefined {
  if (details === undefined)
    return undefined;
  try {
    return truncate(JSON.stringify(sanitizeDetails(details)), MAX_DETAILS_LENGTH);
  }
  catch {
    return truncate(redactString(String(details)), MAX_DETAILS_LENGTH);
  }
}

function utf8ByteLength(value: string): number {
  let length = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    length += codePoint <= 0x7F ? 1 : codePoint <= 0x7FF ? 2 : codePoint <= 0xFFFF ? 3 : 4;
  }
  return length;
}

function serializePersistedEntries(): string {
  const lines = entries
    .filter(entry => entry.level === 'warn' || entry.level === 'error')
    .slice(-MAX_PERSISTED_LOG_ENTRIES)
    .map(({ id: _id, ...entry }) => JSON.stringify(entry));

  while (lines.length > 0 && utf8ByteLength(lines.join('\n')) > MAX_PERSISTED_BYTES)
    lines.shift();

  return lines.join('\n');
}

function parsePersistedEntries(contents: string): PersistedLogEntry[] {
  return contents.split('\n').flatMap((line) => {
    if (!line.trim())
      return [];
    try {
      const value = JSON.parse(line) as Partial<PersistedLogEntry>;
      if (
        typeof value.timestamp !== 'number'
        || (value.level !== 'warn' && value.level !== 'error')
        || typeof value.scope !== 'string'
        || typeof value.message !== 'string'
        || (value.details !== undefined && typeof value.details !== 'string')
      ) {
        return [];
      }
      return [{
        timestamp: value.timestamp,
        level: value.level,
        scope: value.scope,
        message: value.message,
        details: value.details,
      }];
    }
    catch {
      return [];
    }
  }).slice(-MAX_PERSISTED_LOG_ENTRIES);
}

async function restorePersistedEntries(): Promise<void> {
  if (!diagnosticsFileUri)
    return;
  const revision = clearRevision;
  try {
    const contents = await FileSystem.readAsStringAsync(diagnosticsFileUri);
    if (revision !== clearRevision)
      return;
    const restored = parsePersistedEntries(contents).map(entry => ({ id: nextId++, ...entry }));
    if (restored.length === 0)
      return;
    entries = [...restored, ...entries].slice(-MAX_LOG_ENTRIES);
    notify();
  }
  catch {
    // The diagnostics file does not exist on first launch, and logging must never block startup.
  }
}

const hydrationPromise = restorePersistedEntries();
let persistenceQueue: Promise<void> = hydrationPromise;

function queuePersistence(operation: () => Promise<void>): void {
  persistenceQueue = persistenceQueue
    .catch(() => undefined)
    .then(operation)
    .catch(() => undefined);
}

function persistDiagnostics(): void {
  if (!diagnosticsDirectoryUri || !diagnosticsFileUri)
    return;
  queuePersistence(async () => {
    await FileSystem.makeDirectoryAsync(diagnosticsDirectoryUri, { intermediates: true });
    await FileSystem.writeAsStringAsync(diagnosticsFileUri, serializePersistedEntries());
  });
}

function mirrorDiagnosticEntry(entry: AppLogEntry): void {
  const output = `[WIFICAMERA_DIAGNOSTIC][${entry.level.toUpperCase()}][${entry.scope}] ${entry.message}${entry.details ? ` ${entry.details}` : ''}`;
  if (entry.level === 'error')
    console.error(output);
  else
    console.warn(output);
}

function append(level: AppLogLevel, payload: AppLogPayload): void {
  const entry: AppLogEntry = {
    id: nextId++,
    timestamp: Date.now(),
    level,
    scope: truncate(payload.scope, 80),
    message: truncate(redactString(payload.message), MAX_MESSAGE_LENGTH),
    details: serializeDetails(payload.details),
  };
  entries = [...entries.slice(-(MAX_LOG_ENTRIES - 1)), entry];
  notify();

  if (level === 'warn' || level === 'error') {
    mirrorDiagnosticEntry(entry);
    persistDiagnostics();
  }
}

async function flushPersistence(): Promise<void> {
  let pending: Promise<void>;
  do {
    pending = persistenceQueue;
    await pending;
  } while (pending !== persistenceQueue);
}

function formatDiagnosticEntries(): string {
  if (entries.length === 0)
    return 'No diagnostic logs.';
  return entries.map((entry) => {
    const prefix = `${new Date(entry.timestamp).toISOString()} ${entry.level.toUpperCase()} [${entry.scope}] ${entry.message}`;
    return entry.details ? `${prefix}\n  ${entry.details}` : prefix;
  }).join('\n');
}

async function createExportFile(): Promise<string> {
  if (!FileSystem.cacheDirectory)
    throw new Error('Diagnostic export directory is unavailable.');
  await hydrationPromise;
  const uri = `${FileSystem.cacheDirectory}wificamera-diagnostic.log`;
  await FileSystem.writeAsStringAsync(uri, formatDiagnosticEntries());
  return uri;
}

export const appLogger = {
  debug: (scope: string, message: string, details?: unknown) => append('debug', { scope, message, details }),
  info: (scope: string, message: string, details?: unknown) => append('info', { scope, message, details }),
  warn: (scope: string, message: string, details?: unknown) => append('warn', { scope, message, details }),
  error: (scope: string, message: string, details?: unknown) => append('error', { scope, message, details }),
  getSnapshot: (): readonly AppLogEntry[] => entries,
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  ready: (): Promise<void> => hydrationPromise,
  flush: flushPersistence,
  getExportText: formatDiagnosticEntries,
  createExportFile,
  clear: (): void => {
    entries = [];
    clearRevision += 1;
    notify();
    if (diagnosticsFileUri)
      queuePersistence(() => FileSystem.deleteAsync(diagnosticsFileUri, { idempotent: true }));
  },
};
