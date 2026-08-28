/* eslint-disable no-unused-vars -- Host-side byte-level ADB UDP relay; protocol framing intentionally mirrors the verified web reference implementation. */
import { createSocket } from "node:dgram";
import { createServer, request as httpRequest } from "node:http";
import { connect as netConnect } from "node:net";

const port = Number(process.env.USB_RELAY_PORT || 18787);
const boardWhepHost = process.env.BOARD_WHEP_HOST || "127.0.0.1";
const boardWhepPort = Number(process.env.BOARD_WHEP_PORT || 18889);
const tunnelHost = process.env.BOARD_WEBRTC_TUNNEL_HOST || "127.0.0.1";
const tunnelPort = Number(process.env.BOARD_WEBRTC_TUNNEL_PORT || 18190);
const relayBindHost = process.env.RELAY_WEBRTC_BIND_HOST || "0.0.0.0";
const relayAdvertiseHost =
  process.env.RELAY_WEBRTC_ADVERTISE_HOST || "10.0.2.2";
const relayUdpPort = Number(process.env.RELAY_WEBRTC_UDP_PORT || 18189);

const stats = {
  startedAt: Date.now(),
  clients: 0,
  clientPackets: 0,
  clientBytes: 0,
  boardPackets: 0,
  boardBytes: 0,
  lastError: "",
};

const udpSocket = createSocket("udp4");
const clients = new Map();

function closeClient(key, client) {
  try {
    client.tunnel?.destroy();
  } catch {}
  clients.delete(key);
  stats.clients = clients.size;
}

function resetClients() {
  for (const [key, client] of clients) {
    closeClient(key, client);
  }
  stats.clients = 0;
  stats.clientPackets = 0;
  stats.clientBytes = 0;
  stats.boardPackets = 0;
  stats.boardBytes = 0;
  stats.lastError = "";
}

function cleanupStaleClients(maxAgeMs = 8000) {
  const now = Date.now();
  for (const [key, client] of clients) {
    if (now - client.seenAt > maxAgeMs) closeClient(key, client);
  }
}

function writeTunnelFrame(tunnel, message) {
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(message.length, 0);
  tunnel.write(Buffer.concat([header, message]));
}

function receiveTunnelFrames(client, chunk, key) {
  client.buffer = Buffer.concat([client.buffer, chunk]);
  while (client.buffer.length >= 4) {
    const size = client.buffer.readUInt32BE(0);
    if (size <= 0 || size > 65535) {
      stats.lastError = `invalid ADB UDP frame for ${key}: ${size}`;
      client.tunnel?.destroy();
      return;
    }
    if (client.buffer.length < size + 4) return;
    const message = client.buffer.subarray(4, size + 4);
    client.buffer = client.buffer.subarray(size + 4);
    stats.boardPackets += 1;
    stats.boardBytes += message.length;
    udpSocket.send(message, client.port, client.address);
  }
}

function ensureTunnel(client, key) {
  if (client.tunnel && !client.tunnel.destroyed) return;
  const tunnel = netConnect({ host: tunnelHost, port: tunnelPort });
  client.tunnel = tunnel;
  client.tunnelReady = false;
  client.buffer = Buffer.alloc(0);
  client.queue = [];

  tunnel.on("connect", () => {
    if (client.tunnel !== tunnel) return;
    client.tunnelReady = true;
    for (const message of client.queue.splice(0))
      writeTunnelFrame(tunnel, message);
  });
  tunnel.on("data", (chunk) => receiveTunnelFrames(client, chunk, key));
  tunnel.on("error", (error) => {
    if (client.tunnel === tunnel)
      stats.lastError = `ADB UDP tunnel ${key}: ${error.message}`;
  });
  tunnel.on("close", () => {
    if (client.tunnel === tunnel) {
      client.tunnel = null;
      client.tunnelReady = false;
    }
  });
}

function getClient(rinfo) {
  const key = `${rinfo.address}:${rinfo.port}`;
  let client = clients.get(key);
  if (!client) {
    client = {
      address: rinfo.address,
      port: rinfo.port,
      seenAt: Date.now(),
      tunnel: null,
      tunnelReady: false,
      buffer: Buffer.alloc(0),
      queue: [],
    };
    clients.set(key, client);
    stats.clients = clients.size;
  }
  client.seenAt = Date.now();
  return [key, client];
}

udpSocket.on("message", (message, rinfo) => {
  const [key, client] = getClient(rinfo);
  stats.clientPackets += 1;
  stats.clientBytes += message.length;
  ensureTunnel(client, key);
  if (!client.tunnelReady) {
    if (client.queue.length >= 64) client.queue.shift();
    client.queue.push(Buffer.from(message));
    return;
  }
  writeTunnelFrame(client.tunnel, message);
});
udpSocket.on("error", (error) => {
  stats.lastError = `relay UDP socket: ${error.message}`;
});
udpSocket.bind(relayUdpPort, relayBindHost);
setInterval(cleanupStaleClients, 2000).unref();

function rewriteSdpCandidates(sdp) {
  const lineEnding = sdp.includes("\r\n") ? "\r\n" : "\n";
  const trailing = sdp.endsWith(lineEnding);
  const rewritten = sdp
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line.match(
        /^(a=candidate:\S+\s+\d+\s+)(udp|tcp)(\s+\d+)(\s+)(\S+)(\s+)(\d+)(\s+typ\s+host(?:\s+.*)?)$/i,
      );
      if (!match) return [line];
      const [
        ,
        before,
        protocol,
        priority,
        spaceBeforeAddress,
        _address,
        spaceBeforePort,
        _port,
        after,
      ] = match;
      if (protocol.toLowerCase() !== "udp") return [];
      const hosts = Array.from(new Set(["127.0.0.1", relayAdvertiseHost]));
      return hosts.map((host, idx) => {
        const candidateBefore = before.replace(
          /^(a=candidate:\S+)/,
          `$1${idx}`,
        );
        const prio = Number(priority.trim()) - idx;
        return `${candidateBefore}${protocol} ${prio}${spaceBeforeAddress}${host}${spaceBeforePort}${relayUdpPort}${after}`;
      });
    })
    .filter(Boolean)
    .join(lineEnding);
  return trailing ? `${rewritten}${lineEnding}` : rewritten;
}

function ensureH264InOffer(sdp) {
  if (/a=rtpmap:\d+\s+H264\/90000/i.test(sdp)) {
    return sdp;
  }
  const pt = "102";
  const lineEnding = sdp.includes("\r\n") ? "\r\n" : "\n";
  const h264Lines = [
    `a=rtpmap:${pt} H264/90000`,
    `a=rtcp-fb:${pt} goog-remb`,
    `a=rtcp-fb:${pt} transport-cc`,
    `a=rtcp-fb:${pt} ccm fir`,
    `a=rtcp-fb:${pt} nack`,
    `a=rtcp-fb:${pt} nack pli`,
    `a=fmtp:${pt} packetization-mode=1;profile-level-id=42e01f;level-asymmetry-allowed=1`,
  ].join(lineEnding);

  let modified = sdp.replace(/(m=video\s+\d+\s+\S+)(\s+.*)?/, `$1 ${pt}$2`);
  if (modified.includes("a=recvonly")) {
    modified = modified.replace("a=recvonly", `a=recvonly${lineEnding}${h264Lines}`);
  } else if (modified.includes("a=mid:0")) {
    modified = modified.replace("a=mid:0", `a=mid:0${lineEnding}${h264Lines}`);
  } else {
    modified = modified + lineEnding + h264Lines;
  }
  return modified;
}

function rewriteLocation(location, incomingUrl) {
  if (!location) return location;
  try {
    if (location.startsWith("/"))
      return `${incomingUrl.origin}/board-webrtc${location}`;
    const upstream = new URL(location);
    if (
      upstream.hostname === boardWhepHost &&
      Number(upstream.port || 80) === boardWhepPort
    ) {
      return `${incomingUrl.origin}/board-webrtc${upstream.pathname}${upstream.search}`;
    }
  } catch {}
  return location;
}

function proxyWhep(request, response) {
  const incomingUrl = new URL(
    request.url || "/",
    `http://${request.headers.host}`,
  );
  const targetPath = incomingUrl.pathname.replace(/^\/board-webrtc/, "") || "/";
  const isSdpPost =
    request.method === "POST" &&
    String(request.headers["content-type"] || "").includes("application/sdp");

  const forwardToUpstream = (bodyBuffer) => {
    let finalBody = bodyBuffer;
    const reqHeaders = {
      ...request.headers,
      host: `${boardWhepHost}:${boardWhepPort}`,
    };
    if (isSdpPost && bodyBuffer) {
      const originalSdp = bodyBuffer.toString("utf8");
      const normalizedSdp = ensureH264InOffer(originalSdp);
      finalBody = Buffer.from(normalizedSdp, "utf8");
      reqHeaders["content-length"] = finalBody.length;
    }

    const upstream = httpRequest(
      {
        host: boardWhepHost,
        port: boardWhepPort,
        path: `${targetPath}${incomingUrl.search}`,
        method: request.method,
        headers: reqHeaders,
      },
      (upstreamResponse) => {
        const headers = { ...upstreamResponse.headers };
        if (headers.location)
          headers.location = rewriteLocation(
            String(headers.location),
            incomingUrl,
          );
        const contentType = String(headers["content-type"] || "");
        if (!contentType.includes("application/sdp")) {
          response.writeHead(upstreamResponse.statusCode || 502, headers);
          upstreamResponse.pipe(response);
          return;
        }

        const chunks = [];
        upstreamResponse.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        upstreamResponse.on("end", () => {
          const body = rewriteSdpCandidates(
            Buffer.concat(chunks).toString("utf8"),
          );
          delete headers["content-length"];
          response.writeHead(upstreamResponse.statusCode || 502, headers);
          response.end(body);
        });
      },
    );

    upstream.setTimeout(10_000, () =>
      upstream.destroy(new Error("board WHEP proxy timeout")),
    );
    upstream.on("error", (error) => {
      stats.lastError = `WHEP proxy: ${error.message}`;
      if (!response.headersSent)
        response.writeHead(502, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: stats.lastError }));
    });

    if (finalBody) {
      upstream.end(finalBody);
    } else {
      request.pipe(upstream);
    }
  };

  if (isSdpPost) {
    const bodyChunks = [];
    request.on("data", (chunk) => bodyChunks.push(Buffer.from(chunk)));
    request.on("end", () => forwardToUpstream(Buffer.concat(bodyChunks)));
  } else {
    forwardToUpstream(null);
  }
}

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  if (url.pathname === "/stream-health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ready: true,
        mode: "adb-udp-tunnel",
        whep: `${boardWhepHost}:${boardWhepPort}`,
        relay: `${relayAdvertiseHost}:${relayUdpPort}`,
        tunnel: `${tunnelHost}:${tunnelPort}`,
      }),
    );
    return;
  }
  if (url.pathname === "/relay-stats") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(stats));
    return;
  }
  if (url.pathname === "/relay-reset" && request.method === "POST") {
    resetClients();
    response.writeHead(204);
    response.end();
    return;
  }
  if (url.pathname.startsWith("/board-webrtc/")) {
    proxyWhep(request, response);
    return;
  }
  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not found" }));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[usb-relay] HTTP 0.0.0.0:${port}`);
  console.log(`[usb-relay] WHEP ${boardWhepHost}:${boardWhepPort}`);
  console.log(
    `[usb-relay] UDP ${relayBindHost}:${relayUdpPort}; candidate ${relayAdvertiseHost}:${relayUdpPort}`,
  );
  console.log(`[usb-relay] ADB tunnel ${tunnelHost}:${tunnelPort}`);
});
