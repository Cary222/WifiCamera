import type * as TransportModuleType from './transport';

/**
 * The manual-preference contract.
 *
 * A user who explicitly picks USB or WiFi is making a statement about their
 * physical setup, not a hint. Probing must never move them onto the other
 * link behind their back — a silent switch makes the app appear to work while
 * the user is still debugging the cable or hotspot they actually care about.
 * `auto` is the only mode allowed to choose.
 */
jest.mock('@/lib/storage', () => {
  // Declared inside the factory: jest hoists mocks above module-scope consts.
  const store = new Map<string, unknown>();
  return {
    __store: store,
    getItem: jest.fn((key: string) => store.get(key)),
    setItem: jest.fn((key: string, value: unknown) => store.set(key, value)),
  };
});

jest.mock('env', () => ({ default: {}, __esModule: true }));

const storage = (jest.requireMock('@/lib/storage') as { __store: Map<string, unknown> }).__store;

type TransportModule = typeof TransportModuleType;

const STORED_PREFERENCE_KEY = 'CAMERA_TRANSPORT';

/**
 * Re-evaluate the module so module-scope state (the active transport, which is
 * derived from storage at import time) reflects the preference under test.
 */
function loadTransport() {
  let module: TransportModule;
  jest.isolateModules(() => {
    module = require('./transport') as TransportModule;
  });
  return module!;
}

/** Answer `/status` only for the links named in `reachable`. */
function mockReachableLinks(reachable: { usb?: boolean; wifi?: boolean }) {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    // USB forwards live on the loopback/emulator host; WiFi is the board AP.
    const isUsb = url.includes('127.0.0.1') || url.includes('10.0.2.2') || url.includes('localhost');
    const ok = isUsb ? reachable.usb === true : reachable.wifi === true;
    return {
      ok,
      json: async () => ({ ok }),
    } as Response;
  }) as typeof fetch;
}

beforeEach(() => {
  storage.clear();
  jest.clearAllMocks();
});

afterEach(() => {
  // @ts-expect-error restoring the ambient fetch between cases
  delete globalThis.fetch;
});

describe('stored transport preference', () => {
  it('defaults to auto so a fresh install can discover the reachable link', async () => {
    const { getTransportPreference, getActiveTransport } = await loadTransport();
    expect(getTransportPreference()).toBe('auto');
    // A fresh install must not start pinned to a link it has never probed.
    expect(['usb', 'wifi']).toContain(getActiveTransport());
  });

  it('starts on the link the user explicitly stored', async () => {
    storage.set(STORED_PREFERENCE_KEY, 'usb');
    const usbModule = await loadTransport();
    expect(usbModule.getTransportPreference()).toBe('usb');
    expect(usbModule.getActiveTransport()).toBe('usb');

    storage.set(STORED_PREFERENCE_KEY, 'wifi');
    const wifiModule = await loadTransport();
    expect(wifiModule.getTransportPreference()).toBe('wifi');
    expect(wifiModule.getActiveTransport()).toBe('wifi');
  });

  it('treats an unrecognised stored value as auto instead of trusting it', async () => {
    storage.set(STORED_PREFERENCE_KEY, 'bluetooth');
    const { getTransportPreference } = await loadTransport();
    expect(getTransportPreference()).toBe('auto');
  });
});

describe('probeTransports keeps the caller on its preferred link', () => {
  it('stays on the preferred link when that link answers', async () => {
    const { probeTransports } = await loadTransport();
    mockReachableLinks({ usb: true, wifi: true });

    // Both answer: the preference decides, never a hardcoded winner.
    await expect(probeTransports('usb')).resolves.toBe('usb');
    await expect(probeTransports('wifi')).resolves.toBe('wifi');
  });

  it('reports the other link only when the preferred one is unreachable', async () => {
    const { probeTransports } = await loadTransport();

    mockReachableLinks({ usb: true, wifi: false });
    await expect(probeTransports('wifi')).resolves.toBe('usb');

    mockReachableLinks({ usb: false, wifi: true });
    await expect(probeTransports('usb')).resolves.toBe('wifi');
  });

  it('returns null during a total outage so callers hold their transport', async () => {
    const { probeTransports } = await loadTransport();
    mockReachableLinks({ usb: false, wifi: false });

    // Reporting a link here would make a full outage look like a link change.
    await expect(probeTransports('usb')).resolves.toBeNull();
    await expect(probeTransports('wifi')).resolves.toBeNull();
  });

  it('does not silently prefer WiFi when USB is the preferred live link', async () => {
    const { probeTransports } = await loadTransport();
    // Regression guard: an earlier build always returned WiFi when reachable,
    // which stranded USB users on a link they never selected.
    mockReachableLinks({ usb: true, wifi: true });
    await expect(probeTransports('usb')).resolves.toBe('usb');
  });
});

describe('probeTransportReachability', () => {
  it('reports each link independently so the UI can name the broken one', async () => {
    const { probeTransportReachability } = await loadTransport();
    mockReachableLinks({ usb: true, wifi: false });

    await expect(probeTransportReachability()).resolves.toEqual({
      usb: true,
      wifi: false,
    });
  });
});
