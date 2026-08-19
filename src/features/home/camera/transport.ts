import Env from 'env';
import { getItem, setItem } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';

/**
 * Physical link used to reach the board.
 *
 * - `usb`: control and WHEP go through host-side ADB forwards plus the
 *   `usb-webrtc-relay` process, because `adb forward` only carries TCP while
 *   WebRTC media is UDP.
 * - `wifi`: the board's own AP (`SC311-*`, `192.168.1.1`). MediaMTX already
 *   advertises `192.168.1.1` in `webrtcAdditionalHosts`, so no relay is needed.
 */
export type CameraTransport = 'usb' | 'wifi';

/** What the user asked for; `auto` lets probing pick the reachable link. */
export type CameraTransportPreference = 'auto' | CameraTransport;

type TransportEndpoints = {
  base: string;
  whep: string;
};

/** Board AP address, fixed by `hostapd`/`udhcpd` on the device. */
const WIFI_BASE_URL = 'http://192.168.1.1:8999';
const WIFI_WHEP_URL = 'http://192.168.1.1:8889/cam0/whep';

const USB_BASE_URL = 'http://10.0.2.2:18999';
const USB_WHEP_URL = 'http://10.0.2.2:18787/board-webrtc/cam0/whep';

/**
 * `.env` only overrides the USB slot: those values describe host-side ADB
 * forwards, which never apply to a direct WiFi connection.
 */
const TRANSPORT_ENDPOINTS: Record<CameraTransport, TransportEndpoints> = {
  usb: {
    base: Env.EXPO_PUBLIC_CAMERA_BASE_URL || USB_BASE_URL,
    whep: Env.EXPO_PUBLIC_CAMERA_WHEP_URL || USB_WHEP_URL,
  },
  wifi: {
    base: WIFI_BASE_URL,
    whep: WIFI_WHEP_URL,
  },
};

/** How long a probe waits for `/status` before giving up on a link. */
export const TRANSPORT_PROBE_TIMEOUT_MS = 2_000;
/**
 * Time the control channel must stay down before `auto` considers switching.
 * USB re-enumeration drops the link for a second or two several times per
 * session, and those blips must not bounce the app between transports.
 */
export const TRANSPORT_FALLBACK_GRACE_MS = 5_000;
/** Minimum spacing between probes, so a flapping link cannot spam the board. */
export const TRANSPORT_PROBE_MIN_INTERVAL_MS = 5_000;

let activeTransport: CameraTransport = readStoredPreference() === 'wifi' ? 'wifi' : 'usb';

export function getTransportEndpoints(transport: CameraTransport): TransportEndpoints {
  return TRANSPORT_ENDPOINTS[transport];
}

export function getActiveTransport(): CameraTransport {
  return activeTransport;
}

export function setActiveTransport(transport: CameraTransport): void {
  activeTransport = transport;
}

function readStoredPreference(): CameraTransportPreference {
  const stored = getItem<CameraTransportPreference>(STORAGE_KEYS.CAMERA_TRANSPORT);
  return stored === 'usb' || stored === 'wifi' || stored === 'auto' ? stored : 'auto';
}

export function getTransportPreference(): CameraTransportPreference {
  return readStoredPreference();
}

export function setTransportPreference(preference: CameraTransportPreference): void {
  setItem(STORAGE_KEYS.CAMERA_TRANSPORT, preference);
}

async function isTransportReachable(transport: CameraTransport): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSPORT_PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${TRANSPORT_ENDPOINTS[transport].base}/status`, {
      signal: controller.signal,
    });
    if (!response.ok)
      return false;
    const payload = await response.json() as { ok?: boolean };
    return payload?.ok === true;
  }
  catch {
    return false;
  }
  finally {
    clearTimeout(timer);
  }
}

/**
 * Probe both links at once and return the first one that answers `/status`.
 *
 * Probing in parallel matters: when the preferred link is dead, a sequential
 * probe would pay the full timeout before even trying the other one.
 * Returns `null` when neither answers, and the caller keeps the current
 * transport so a total outage does not look like a link change.
 */
export async function probeTransports(
  preferred: CameraTransport = activeTransport,
): Promise<CameraTransport | null> {
  const other: CameraTransport = preferred === 'usb' ? 'wifi' : 'usb';
  const [preferredOk, otherOk] = await Promise.all([
    isTransportReachable(preferred),
    isTransportReachable(other),
  ]);
  if (preferredOk)
    return preferred;
  return otherOk ? other : null;
}
