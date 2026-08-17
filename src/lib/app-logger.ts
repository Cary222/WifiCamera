export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type AppLogEntry = {
  id: number;
  timestamp: number;
  level: AppLogLevel;
  scope: string;
  message: string;
  details?: string;
};

const MAX_LOG_ENTRIES = 500;

let nextId = 1;
let entries: AppLogEntry[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach(listener => listener());
}

function serializeDetails(details: unknown): string | undefined {
  if (details === undefined)
    return undefined;
  if (typeof details === 'string')
    return details;
  try {
    return JSON.stringify(details);
  }
  catch {
    return String(details);
  }
}

type AppLogPayload = {
  scope: string;
  message: string;
  details?: unknown;
};

function append(level: AppLogLevel, payload: AppLogPayload): void {
  entries = [
    ...entries.slice(-(MAX_LOG_ENTRIES - 1)),
    {
      id: nextId++,
      timestamp: Date.now(),
      level,
      scope: payload.scope,
      message: payload.message,
      details: serializeDetails(payload.details),
    },
  ];
  notify();
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
  clear: (): void => {
    entries = [];
    notify();
  },
};
