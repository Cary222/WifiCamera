/* eslint-disable max-lines-per-function */

import type { MediaStream, MediaStreamTrack } from 'react-native-webrtc';
import { NativeModules } from 'react-native';
import { appLogger } from '@/lib/app-logger';
import { logStreamPoint } from './stream-start-probe';

const NativeWebRTC = NativeModules.WebRTCModule
  ? require('react-native-webrtc')
  : null;

/**
 * Web fallback: browsers ship their own standards-based WebRTC, so the same
 * negotiation code runs against `window.RTCPeerConnection` when the
 * react-native-webrtc native module is absent.
 */
const BrowserWebRTC
  = typeof window !== 'undefined' && window.RTCPeerConnection
    ? {
        RTCPeerConnection: window.RTCPeerConnection,
        MediaStream: window.MediaStream,
        RTCSessionDescription: window.RTCSessionDescription,
      }
    : null;

const WebRTC = NativeWebRTC ?? BrowserWebRTC;
const RTCPeerConnection = WebRTC?.RTCPeerConnection;
const MediaStreamClass = WebRTC?.MediaStream;
const RTCSessionDescription = WebRTC?.RTCSessionDescription;

// Landscape waits for start_streaming ack before the first POST. Retry is
// only the leftover T2→T4 gap (554 listening, first H264 not yet). Do not
// abort a healthy USB POST (~100–130ms); 1s is the RTT ceiling per try.
const WHEP_OFFER_RETRY_TIMEOUT_MS = 4000;
const WHEP_OFFER_ATTEMPT_TIMEOUT_MS = 1000;
const WHEP_OFFER_RETRY_INTERVAL_MS = 80;

type OfferData = {
  iceUfrag: string;
  icePwd: string;
  medias: string[];
};

/**
 * Extract the ICE credentials and m-line descriptors from our own offer.
 *
 * MediaMTX matches a trickle-ICE PATCH against these values, so the fragment we
 * send later has to repeat them verbatim (see reader.js `parseOffer`).
 */
function parseOffer(sdp: string): OfferData {
  const result: OfferData = { iceUfrag: '', icePwd: '', medias: [] };

  for (const line of sdp.split('\r\n')) {
    if (line.startsWith('m=')) {
      result.medias.push(line.slice('m='.length));
    }
    else if (result.iceUfrag === '' && line.startsWith('a=ice-ufrag:')) {
      result.iceUfrag = line.slice('a=ice-ufrag:'.length);
    }
    else if (result.icePwd === '' && line.startsWith('a=ice-pwd:')) {
      result.icePwd = line.slice('a=ice-pwd:'.length);
    }
  }

  return result;
}

type LocalCandidate = {
  candidate: string;
  sdpMLineIndex: number | null;
};

/**
 * Build an `application/trickle-ice-sdpfrag` body for the given candidates,
 * grouped by the m-line they belong to (see reader.js `generateSdpFragment`).
 */
function generateSdpFragment(
  offerData: OfferData,
  candidates: LocalCandidate[],
): string {
  const candidatesByMedia = new Map<number, LocalCandidate[]>();
  for (const candidate of candidates) {
    const mid = candidate.sdpMLineIndex;
    if (mid === null)
      continue;
    const bucket = candidatesByMedia.get(mid);
    if (bucket)
      bucket.push(candidate);
    else candidatesByMedia.set(mid, [candidate]);
  }

  let fragment = `a=ice-ufrag:${offerData.iceUfrag}\r\na=ice-pwd:${offerData.icePwd}\r\n`;

  offerData.medias.forEach((media, mid) => {
    const bucket = candidatesByMedia.get(mid);
    if (!bucket)
      return;
    fragment += `m=${media}\r\na=mid:${mid}\r\n`;
    for (const candidate of bucket) {
      fragment += `a=${candidate.candidate}\r\n`;
    }
  });

  return fragment;
}

export type WhepSession = {
  stream: MediaStream;
  close: () => Promise<void>;
  getStats: () => Promise<string>;
};

type WhepSessionOptions = {
  onDisconnected?: () => void;
  onTrack?: (stream: MediaStream, track: MediaStreamTrack) => void;
};

// Diagnostic counter: multiple live sessions mean multiple screens are pulling
// the same board stream at once and starving the WiFi link.
let liveSessionCount = 0;

/**
 * Minimal WHEP receive-only client for the board's MediaMTX endpoint.
 *
 * Modelled on the working browser implementation (app.js
 * `startDirectWebRtcPreview` / `postWhepOfferWhenReady`):
 * - offer a single recvonly video m-line ONLY — the board's custom MediaMTX
 *   build rejects offers carrying audio ("codecs not supported by client") or
 *   a data channel ("sdp: syntax error") with HTTP 400;
 * - do NOT filter loopback candidates; keeping them lets the board and the
 *   phone match up instantly over LAN;
 * - deliver every later ICE candidate via PATCH (trickle ICE), otherwise the
 *   board only sees the few candidates that existed when the offer was posted;
 * - retry the offer POST (short per-try timeout) while the stream source is
 *   still starting, so a fast WHEP connect never races the RTSP source.
 */
export async function openWhepSession(
  whepUrl: string,
  options: WhepSessionOptions = {},
): Promise<WhepSession> {
  if (!RTCPeerConnection || !MediaStreamClass) {
    appLogger.error('WHEP', 'WebRTC 不可用（无原生模块且非浏览器环境）');
    throw new Error('WebRTC is not available in this environment');
  }
  // Browser MediaStream has no `release()`; only the native bridge does.
  const releaseStream = (target: MediaStream) => {
    const releasable = target as MediaStream & { release?: () => void };

    releasable.release?.();
  };
  appLogger.info('WHEP', '开始协商视频流', { whepUrl });
  const peer = new RTCPeerConnection({ iceServers: [] });
  const stream: MediaStream = new MediaStreamClass();
  let sessionUrl: string | null = null;
  let offerData: OfferData | null = null;
  let queuedCandidates: LocalCandidate[] = [];
  let closed = false;
  let disconnectNotified = false;
  let firstDecodedLogged = false;
  let firstFrameTimer: ReturnType<typeof setInterval> | null = null;

  const stopFirstFrameWatch = () => {
    if (!firstFrameTimer)
      return;
    clearInterval(firstFrameTimer);
    firstFrameTimer = null;
  };

  const notifyDisconnected = () => {
    if (closed || disconnectNotified)
      return;
    disconnectNotified = true;
    options.onDisconnected?.();
  };

  // WHEP trickle ICE: every candidate discovered after the offer was posted has
  // to be PATCHed to the session URL. Without this the board only ever sees the
  // handful of candidates that happened to be ready at offer time, which leaves
  // the connection on a poor path (heavy packet loss / constant stalling).
  const sendLocalCandidates = (candidates: LocalCandidate[]) => {
    if (closed || !sessionUrl || !offerData || candidates.length === 0)
      return;
    fetch(sessionUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/trickle-ice-sdpfrag',
        'If-Match': '*',
      },
      body: generateSdpFragment(offerData, candidates),
    }).catch(() => {
      // Candidate delivery is best effort; the already-negotiated pair keeps working.
    });
  };

  peer.onicecandidate = (event: { candidate: LocalCandidate | null }) => {
    if (closed || !event.candidate)
      return;
    if (!sessionUrl)
      queuedCandidates.push(event.candidate);
    else sendLocalCandidates([event.candidate]);
  };

  // Android WebRTC may briefly report `disconnected` during a normal WHEP
  // handshake. Reconnecting at that point tears down a healthy session before
  // the first video frame arrives, so only terminal failures trigger recovery.
  peer.onconnectionstatechange = () => {
    if (peer.connectionState === 'failed') {
      notifyDisconnected();
    }
  };
  peer.oniceconnectionstatechange = () => {
    if (peer.iceConnectionState === 'failed') {
      notifyDisconnected();
    }
  };

  peer.addTransceiver('video', { direction: 'recvonly' });

  let ontrackLogged = false;
  peer.ontrack = (event: {
    streams: MediaStream[];
    track: MediaStreamTrack;
  }) => {
    const source = event.streams[0];
    for (const track of source?.getTracks() ?? [event.track]) {
      if (track.kind !== 'video')
        continue;
      track.onended = notifyDisconnected;
      if (
        !stream
          .getTracks()
          .some((current: MediaStreamTrack) => current.id === track.id)
      ) {
        stream.addTrack(track);
      }
      if (!ontrackLogged) {
        ontrackLogged = true;
        logStreamPoint('whep_ontrack', { trackId: track.id });
      }
      options.onTrack?.(source ?? stream, track);
    }
  };

  try {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    // The browser posts the offer immediately and lets trickle ICE finish
    // afterwards. Blocking on gathering here only delays the first frame.

    const localSdp = peer.localDescription?.sdp;
    if (!localSdp)
      throw new Error('WHEP offer SDP is unavailable');
    offerData = parseOffer(localSdp);

    const response = await postWhepOfferWhenReady(
      whepUrl,
      localSdp,
      () => closed,
    );
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      appLogger.warn('WHEP', '视频协商请求失败', {
        status: response.status,
        error: errorText,
      });
      throw new Error(
        `WHEP negotiation failed: HTTP ${response.status} ${errorText}`,
      );
    }

    const location = response.headers.get('location');
    if (location) {
      // Web proxy returns a root-relative Location; resolve it against the
      // page origin since `new URL()` requires an absolute base.
      const baseUrl
        = whepUrl.startsWith('/') && typeof globalThis.location !== 'undefined'
          ? globalThis.location.origin
          : whepUrl;
      sessionUrl = new URL(location, baseUrl).toString();
    }
    const answerSdp = await response.text();
    await peer.setRemoteDescription(
      new RTCSessionDescription({ type: 'answer', sdp: answerSdp }),
    );

    // Candidates gathered before the session URL existed are delivered now.
    if (queuedCandidates.length > 0) {
      sendLocalCandidates(queuedCandidates);
      queuedCandidates = [];
    }

    liveSessionCount += 1;
    appLogger.info('WHEP', '视频流已连接', { liveSessionCount });
    logStreamPoint('sdp_live', { liveSessionCount });
    if (__DEV__)
      console.warn(`[CameraWHEP] session live, total=${liveSessionCount}`);

    const watchStartedAt = Date.now();
    firstFrameTimer = setInterval(() => {
      if (closed || firstDecodedLogged) {
        stopFirstFrameWatch();
        return;
      }
      if (Date.now() - watchStartedAt > 10_000) {
        firstDecodedLogged = true;
        stopFirstFrameWatch();
        logStreamPoint('first_decoded_timeout');
        return;
      }
      void peer.getStats().then((report) => {
        if (closed || firstDecodedLogged)
          return;
        let decoded = 0;
        report.forEach((item: Record<string, unknown>) => {
          if (item.type === 'inbound-rtp' && item.kind === 'video')
            decoded = Number(item.framesDecoded) || 0;
        });
        if (decoded > 0) {
          firstDecodedLogged = true;
          stopFirstFrameWatch();
          logStreamPoint('first_decoded_frame', { framesDecoded: decoded });
        }
      }).catch(() => {});
    }, 80);
  }
  catch (error) {
    appLogger.error('WHEP', '视频流协商失败', String(error));
    peer.close();
    releaseStream(stream);
    throw error;
  }

  return {
    stream,
    getStats: async () => {
      const report = await peer.getStats();
      const rows: string[] = [];
      report.forEach((item: Record<string, unknown>) => {
        if (item.type === 'inbound-rtp') {
          rows.push(
            `inbound-rtp kind=${item.kind} pktsLost=${item.packetsLost} `
            + `framesDecoded=${item.framesDecoded} fps=${item.framesPerSecond} `
            + `jitterMs=${Math.round(Number(item.jitter) * 1000)} bytes=${item.bytesReceived}`,
          );
        }
        if (
          item.type === 'candidate-pair'
          && (item.state === 'succeeded' || item.nominated)
        ) {
          rows.push(`pair nominated=${item.nominated} state=${item.state}`);
        }
      });
      return rows.join(' | ');
    },
    close: async () => {
      if (closed)
        return;
      closed = true;
      stopFirstFrameWatch();
      peer.close();
      releaseStream(stream);
      liveSessionCount = Math.max(0, liveSessionCount - 1);
      if (__DEV__)
        console.warn(`[CameraWHEP] session closed, live=${liveSessionCount}`);
      if (sessionUrl) {
        try {
          await fetch(sessionUrl, { method: 'DELETE' });
        }
        catch {
          // The board cleans stale WHEP sessions itself; teardown is best effort.
        }
      }
    },
  };
}

async function postWhepOfferOnce(
  whepUrl: string,
  sdp: string,
  timeoutMs: number,
  isCancelled: () => boolean,
): Promise<Response | 'aborted' | 'cancelled'> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const cancelWatch = setInterval(() => {
    if (isCancelled())
      controller.abort();
  }, 50);

  try {
    return await fetch(whepUrl, {
      method: 'POST',
      headers: { 'Accept': 'application/sdp', 'Content-Type': 'application/sdp' },
      body: sdp,
      signal: controller.signal,
    });
  }
  catch {
    return isCancelled() ? 'cancelled' : 'aborted';
  }
  finally {
    clearTimeout(timer);
    clearInterval(cancelWatch);
  }
}

async function postWhepOfferWhenReady(
  whepUrl: string,
  sdp: string,
  isCancelled: () => boolean,
): Promise<Response> {
  const startedAt = Date.now();
  let attempt = 0;
  let last: Response | null = null;

  while (
    !isCancelled()
    && Date.now() - startedAt < WHEP_OFFER_RETRY_TIMEOUT_MS
  ) {
    attempt += 1;
    if (attempt === 1)
      logStreamPoint('whep_post_first');

    const result = await postWhepOfferOnce(
      whepUrl,
      sdp,
      WHEP_OFFER_ATTEMPT_TIMEOUT_MS,
      isCancelled,
    );
    if (result === 'cancelled')
      throw new Error('WHEP offer cancelled');
    if (result === 'aborted') {
      await sleep(WHEP_OFFER_RETRY_INTERVAL_MS);
      continue;
    }

    last = result;
    if (result.ok) {
      logStreamPoint('whep_post_done', {
        attempt,
        status: result.status,
        ok: true,
      });
      if (__DEV__)
        console.info(`[CameraWHEP] POST ${result.status} attempt=${attempt}`);
      return result;
    }

    await sleep(WHEP_OFFER_RETRY_INTERVAL_MS);
  }

  logStreamPoint('whep_post_done', {
    attempt,
    status: last?.status ?? 0,
    ok: false,
    giveUp: true,
  });
  if (last)
    return last;
  throw new Error('WHEP offer timed out');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
