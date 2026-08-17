/* eslint-disable max-lines-per-function */

import type { MediaStream, MediaStreamTrack } from 'react-native-webrtc';
import { NativeModules } from 'react-native';

const NativeWebRTC = NativeModules.WebRTCModule ? require('react-native-webrtc') : null;

const MediaStreamClass = NativeWebRTC?.MediaStream;
const RTCPeerConnection = NativeWebRTC?.RTCPeerConnection;
const RTCSessionDescription = NativeWebRTC?.RTCSessionDescription;

// Matches the browser build (app.js `postWhepOfferWhenReady`): keep offering the
// WHEP endpoint while the board is still spinning up its MediaMTX source.
const WHEP_OFFER_RETRY_TIMEOUT_MS = 1800;
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
function generateSdpFragment(offerData: OfferData, candidates: LocalCandidate[]): string {
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
};

// Diagnostic counter: multiple live sessions mean multiple screens are pulling
// the same board stream at once and starving the WiFi link.
let liveSessionCount = 0;

/**
 * Minimal WHEP receive-only client for the board's MediaMTX endpoint.
 *
 * Modelled on the working browser implementation (app.js
 * `startDirectWebRtcPreview` / `postWhepOfferWhenReady`):
 * - add recvonly video/audio transceivers plus a data channel, matching the
 *   browser offer exactly — MediaMTX answers a video-only offer differently and
 *   that negotiation stalls;
 * - do NOT filter loopback candidates; keeping them lets the board and the
 *   phone match up instantly over LAN;
 * - deliver every later ICE candidate via PATCH (trickle ICE), otherwise the
 *   board only sees the few candidates that existed when the offer was posted;
 * - retry the offer POST for up to ~1.8s while the board's stream source is
 *   still starting, so a fast WHEP connect never races the RTSP source.
 */
export async function openWhepSession(whepUrl: string, options: WhepSessionOptions = {}): Promise<WhepSession> {
  if (!RTCPeerConnection || !MediaStreamClass) {
    throw new Error('WebRTC native module is not available in this environment');
  }
  const peer = new RTCPeerConnection({ iceServers: [] });
  const stream: MediaStream = new MediaStreamClass();
  let sessionUrl: string | null = null;
  let offerData: OfferData | null = null;
  let queuedCandidates: LocalCandidate[] = [];
  let closed = false;
  let disconnectNotified = false;

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
  peer.addTransceiver('audio', { direction: 'recvonly' });
  peer.createDataChannel('');

  peer.ontrack = (event: { streams: MediaStream[]; track: MediaStreamTrack }) => {
    const source = event.streams[0];
    for (const track of source?.getTracks() ?? [event.track]) {
      if (track.kind !== 'video')
        continue;
      track.onended = notifyDisconnected;
      if (!stream.getTracks().some((current: MediaStreamTrack) => current.id === track.id)) {
        stream.addTrack(track);
      }
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

    const response = await postWhepOfferWhenReady(whepUrl, localSdp, () => closed);
    if (!response.ok)
      throw new Error(`WHEP negotiation failed: HTTP ${response.status}`);

    const location = response.headers.get('location');
    if (location)
      sessionUrl = new URL(location, whepUrl).toString();
    const answerSdp = await response.text();
    await peer.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerSdp }));

    // Candidates gathered before the session URL existed are delivered now.
    if (queuedCandidates.length > 0) {
      sendLocalCandidates(queuedCandidates);
      queuedCandidates = [];
    }

    liveSessionCount += 1;
    if (__DEV__)
      console.warn(`[CameraWHEP] session live, total=${liveSessionCount}`);
  }
  catch (error) {
    peer.close();
    stream.release();
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
        if (item.type === 'candidate-pair' && (item.state === 'succeeded' || item.nominated)) {
          rows.push(`pair nominated=${item.nominated} state=${item.state}`);
        }
      });
      return rows.join(' | ');
    },
    close: async () => {
      if (closed)
        return;
      closed = true;
      peer.close();
      stream.release();
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

async function postWhepOfferWhenReady(
  whepUrl: string,
  sdp: string,
  isCancelled: () => boolean,
): Promise<Response> {
  const startedAt = Date.now();
  let attempt = 0;

  while (!isCancelled() && Date.now() - startedAt < WHEP_OFFER_RETRY_TIMEOUT_MS) {
    attempt += 1;
    const response = await fetch(whepUrl, {
      method: 'POST',
      headers: { 'Accept': 'application/sdp', 'Content-Type': 'application/sdp' },
      body: sdp,
    });

    if (response.ok || response.status !== 404) {
      if (__DEV__)
        console.info(`[CameraWHEP] POST ${response.status} attempt=${attempt}`);
      return response;
    }

    await sleep(WHEP_OFFER_RETRY_INTERVAL_MS);
  }

  return fetch(whepUrl, {
    method: 'POST',
    headers: { 'Accept': 'application/sdp', 'Content-Type': 'application/sdp' },
    body: sdp,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
