// Polyfill for Node.js 18 compatibility - must be first
if (!Array.prototype.toReversed) {
  // eslint-disable-next-line no-extend-native
  Array.prototype.toReversed = function () {
    return [...this].reverse();
  };
}

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');
const { WebSocketServer } = require('ws');

/**
 * Camera WebSocket proxy for web development.
 *
 * Creates a WebSocket server that proxies connections to the camera device.
 * This is needed because Metro's enhanceMiddleware cannot handle WebSocket upgrades.
 *
 * Supports both USB mode (via EXPO_PUBLIC_CAMERA_BASE_URL) and WiFi mode (via
 * the WiFi camera IP passed as query parameter).
 */

/**
 * Parse camera connection info from query parameters or environment.
 * Format: /ws/device/?transport=wifi&ip=192.168.1.1
 */
function getUsbProxyBaseUrl() {
  let target;
  try {
    target = new URL(
      process.env.EXPO_PUBLIC_CAMERA_BASE_URL || 'http://127.0.0.1:18999',
    );
  }
  catch {
    target = new URL('http://127.0.0.1:18999');
  }

  // 10.0.2.2 is the Android emulator's alias for the host. Metro itself runs
  // on the host, so its proxy must use the real loopback address instead.
  if (target.hostname === '10.0.2.2')
    target.hostname = '127.0.0.1';

  return target;
}

function parseCameraWsTarget(request) {
  const url = request.url || '/';
  const urlObj = new URL(url, 'http://localhost:8099');

  const transport = urlObj.searchParams.get('transport') || 'wifi';
  const ip = urlObj.searchParams.get('ip');

  if (transport === 'wifi' && ip) {
    return {
      url: `ws://${ip}:8999/ws/device/`,
      transport: 'wifi',
      ip,
    };
  }

  const target = getUsbProxyBaseUrl();
  target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:';
  target.pathname = '/ws/device/';
  target.search = '';

  return {
    url: target.toString(),
    transport: 'usb',
    ip: null,
  };
}

let wsProxyServer = null;

function closeProxiedSocket(socket, code, reason) {
  if (socket.readyState !== 0 && socket.readyState !== 1)
    return;

  // 1005/1006 are local status values and are forbidden in a close frame.
  // Terminating preserves an abnormal close for the peer without crashing ws.
  if (code === 1006) {
    socket.terminate();
    return;
  }
  if (code === 1005) {
    socket.close();
    return;
  }
  socket.close(code, reason?.toString());
}

// The proxy keeps both socket lifecycles together so forwarding and teardown
// cannot diverge across separate handlers.

/** Forward client→target messages, buffering until the target is open. */
function forwardClientMessages(clientWs, targetWs, pendingMessages) {
  clientWs.on('message', (data, isBinary) => {
    if (targetWs.readyState === 1) {
      targetWs.send(data, { binary: isBinary });
    }
    else if (targetWs.readyState === 0) {
      pendingMessages.push([data, isBinary]);
    }
  });

  clientWs.on('close', (code, reason) => {
    console.log('[CameraProxy] 客户端断开:', code, reason?.toString());
    closeProxiedSocket(targetWs, code, reason);
  });

  clientWs.on('error', (err) => {
    console.error('[CameraProxy] 客户端 WebSocket 错误:', err.message);
  });
}

function createCameraWsProxy() {
  console.log('[CameraProxy] 初始化相机 WebSocket 代理');
  console.log('[CameraProxy] 默认 USB 地址:', getUsbProxyBaseUrl().toString());

  // Create WebSocket server on a separate port
  const proxyPort = 8099;
  wsProxyServer = new WebSocketServer({ noServer: true });

  wsProxyServer.on('connection', (clientWs, request) => {
    const targetInfo = parseCameraWsTarget(request);
    const targetUrl = targetInfo.url;

    console.log('[CameraProxy] 收到 WebSocket 连接请求:', {
      transport: targetInfo.transport,
      ip: targetInfo.ip,
      path: request.url,
    });
    console.log('[CameraProxy] 转发到:', targetUrl);

    // Connect to target camera WebSocket
    // Dynamic import for ES module
    let targetWs;
    const pendingMessages = [];
    try {
      const WebSocket = require('ws');
      targetWs = new WebSocket(targetUrl);
    }
    catch (e) {
      console.error('[CameraProxy] 无法创建目标 WebSocket:', e.message);
      clientWs.close(1011, 'Target unavailable');
      return;
    }

    targetWs.on('open', () => {
      console.log('[CameraProxy] ✅ 已连接到相机');
      for (const [data, isBinary] of pendingMessages)
        targetWs.send(data, { binary: isBinary });
      pendingMessages.length = 0;
    });

    targetWs.on('message', (data, isBinary) => {
      if (clientWs.readyState === 1) {
        // Preserve the frame opcode. `ws` delivers text payloads as Buffer too;
        // forwarding without `binary: false` turns JSON into a binary frame.
        clientWs.send(data, { binary: isBinary });
      }
    });

    targetWs.on('close', (code, reason) => {
      console.log(
        '[CameraProxy] 相机 WebSocket 断开:',
        code,
        reason?.toString(),
      );
      closeProxiedSocket(clientWs, code, reason);
    });

    targetWs.on('error', (err) => {
      console.error('[CameraProxy] 相机 WebSocket 错误:', err.message);
      if (clientWs.readyState === 1) {
        clientWs.close(1011, err.message);
      }
    });

    forwardClientMessages(clientWs, targetWs, pendingMessages);
  });

  // Create HTTP server to handle WebSocket upgrade
  const server = http.createServer();
  server.on('upgrade', (request, socket, head) => {
    const url = request.url || '';

    // Only handle /ws/ path
    if (url.startsWith('/ws/')) {
      console.log('[CameraProxy] 拦截 WebSocket 升级请求:', url);
      wsProxyServer.handleUpgrade(request, socket, head, (ws) => {
        wsProxyServer.emit('connection', ws, request);
      });
    }
    else {
      socket.destroy();
    }
  });

  server.listen(proxyPort, () => {
    console.log(
      `[CameraProxy] WebSocket 代理服务器运行在 ws://localhost:${proxyPort}`,
    );
  });

  server.on('error', (err) => {
    console.error('[CameraProxy] 服务器错误:', err.message);
  });

  return server;
}

/**
 * Camera HTTP proxy middleware for non-WebSocket requests.
 *
 * Intercepts requests to Metro dev server (port 8081) under /camera-proxy/
 * and forwards them to the camera HTTP endpoint. This allows the web app's
 * browser-side fetch calls to reach the camera even when on a different port.
 *
 * URL format:
 * - /camera-proxy/wifi?ip=192.168.1.1&port=8999&path=/FileCopy/power/
 * - /camera-proxy/usb?path=/FileCopy/power/
 * - /camera-proxy/?transport=whep&path=/board-webrtc/cam0/whep  (WHEP signaling
 *   via the usb-webrtc-relay; Location headers are rewritten back through this
 *   proxy so trickle-ICE PATCH/DELETE stay on the same origin)
 */
/**
 * Rewrite an upstream WHEP `Location` header so it points back through this
 * proxy, keeping trickle-ICE PATCH/DELETE on the browser's origin.
 */
function proxiedWhepLocation(location, target) {
  try {
    const upstream = new URL(location, target);

    return `/camera-proxy/?transport=whep&path=${encodeURIComponent(
      upstream.pathname + upstream.search,
    )}`;
  }
  catch {
    return null;
  }
}

function createCameraHttpProxyMiddleware() {
  const defaultUsbUrl = getUsbProxyBaseUrl();

  console.log(
    '[CameraProxy] HTTP 代理默认 USB 地址:',
    defaultUsbUrl.toString(),
  );

  return function cameraHttpProxy(req, res, next) {
    const url = req.url || '';

    // Only proxy /camera-proxy/ path
    if (!url.startsWith('/camera-proxy/'))
      return next();

    // Parse query parameters
    const urlObj = new URL(url, 'http://localhost:8081');
    const transport = urlObj.searchParams.get('transport') || 'wifi';
    const cameraIp = urlObj.searchParams.get('ip');
    const cameraPort = urlObj.searchParams.get('port') || '8999';
    const requestPath = urlObj.searchParams.get('path') || '/';

    // Determine target based on transport
    const isWhep = transport === 'whep';
    let target;
    try {
      target = isWhep
        ? new URL('http://127.0.0.1:18787')
        : transport === 'wifi' && cameraIp
          ? new URL(`http://${cameraIp}:${cameraPort}`)
          : defaultUsbUrl;
    }
    catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid camera address' }));
      return;
    }

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return;
    }

    console.log(
      '[CameraProxy] HTTP 代理请求:',
      req.method,
      transport,
      requestPath,
      '->',
      target.toString(),
    );

    const options = {
      hostname: target.hostname,
      port: target.port || 80,
      path: requestPath,
      method: req.method,
      // The legacy camera firmware emits a few responses that Node's strict
      // parser rejects even though browsers/curl accept them.
      insecureHTTPParser: true,
      headers: {
        ...req.headers,
        host: target.host,
      },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      const headers = { ...proxyRes.headers };

      // WHEP answers carry an absolute Location pointing at the relay/board.
      if (isWhep && headers.location) {
        headers.location
          = proxiedWhepLocation(headers.location, target) ?? headers.location;
      }
      res.writeHead(proxyRes.statusCode, {
        ...headers,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('[CameraProxy] HTTP 代理错误:', err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'Camera not reachable',
            target: target.toString(),
          }),
        );
      }
    });

    req.pipe(proxyReq);
  };
}

// Start WebSocket proxy server immediately when this config is loaded
createCameraWsProxy();

const config = getDefaultConfig(__dirname);

const finalConfig = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: path.join(__dirname, 'uniwind-types.d.ts'),
});

// Add HTTP proxy middleware for camera endpoints
finalConfig.server = finalConfig.server || {};
finalConfig.server.enhanceMiddleware = (middleware, _server) => {
  const httpProxy = createCameraHttpProxyMiddleware();
  const stellarDir = path.join(__dirname, 'src', 'assets', 'stellar');
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.wasm': 'application/wasm',
    '.json': 'application/json; charset=utf-8',
    '.ttf': 'font/ttf',
    '.webp': 'image/webp',
    '.png': 'image/png',
  };

  return function (req, res, next) {
    if (req.url && req.url.startsWith('/stellar/')) {
      const rel = req.url.slice('/stellar/'.length).split('?')[0];
      const filePath = path.join(stellarDir, rel);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': contentTypes[ext] || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
        });
        return fs.createReadStream(filePath).pipe(res);
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not Found');
    }
    httpProxy(req, res, () => middleware(req, res, next));
  };
};

module.exports = finalConfig;
