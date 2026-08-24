// Polyfill for Node.js 18 compatibility - must be first
if (!Array.prototype.toReversed) {
  // eslint-disable-next-line no-extend-native
  Array.prototype.toReversed = function () {
    return [...this].reverse();
  };
}

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

  // USB mode or default - use environment variable
  const cameraWsUrl = process.env.EXPO_PUBLIC_CAMERA_BASE_URL
    ? process.env.EXPO_PUBLIC_CAMERA_BASE_URL.replace(/^http/, 'ws')
    : 'ws://192.168.1.1:8999';

  return {
    url: cameraWsUrl.replace(/\/ws\/.*$/, '/ws/device/'),
    transport: 'usb',
    ip: null,
  };
}

let wsProxyServer = null;

function createCameraWsProxy() {
  console.log('[CameraProxy] 初始化相机 WebSocket 代理');
  console.log('[CameraProxy] 默认 USB 地址:', process.env.EXPO_PUBLIC_CAMERA_BASE_URL || 'ws://192.168.1.1:8999');

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
    });

    targetWs.on('message', (data) => {
      if (clientWs.readyState === 1) { // OPEN
        clientWs.send(data);
      }
    });

    targetWs.on('close', (code, reason) => {
      console.log('[CameraProxy] 相机 WebSocket 断开:', code, reason?.toString());
      if (clientWs.readyState === 1) {
        clientWs.close(code, reason?.toString());
      }
    });

    targetWs.on('error', (err) => {
      console.error('[CameraProxy] 相机 WebSocket 错误:', err.message);
      if (clientWs.readyState === 1) {
        clientWs.close(1011, err.message);
      }
    });

    clientWs.on('message', (data) => {
      if (targetWs.readyState === 1) { // OPEN
        targetWs.send(data);
      }
    });

    clientWs.on('close', (code, reason) => {
      console.log('[CameraProxy] 客户端断开:', code, reason?.toString());
      if (targetWs.readyState === 1 || targetWs.readyState === 0) { // OPEN or CONNECTING
        targetWs.close(code, reason?.toString());
      }
    });

    clientWs.on('error', (err) => {
      console.error('[CameraProxy] 客户端 WebSocket 错误:', err.message);
    });
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
    console.log(`[CameraProxy] WebSocket 代理服务器运行在 ws://localhost:${proxyPort}`);
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
 */
function createCameraHttpProxyMiddleware() {
  // Default USB camera base URL from environment
  const defaultUsbUrl = process.env.EXPO_PUBLIC_CAMERA_BASE_URL || 'http://10.0.2.2:18999';

  console.log('[CameraProxy] HTTP 代理默认 USB 地址:', defaultUsbUrl);

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
    let target;
    if (transport === 'wifi' && cameraIp) {
      target = new URL(`http://${cameraIp}:${cameraPort}`);
    }
    else {
      // USB mode or no IP provided, use default USB URL
      target = new URL(defaultUsbUrl);
    }

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return;
    }

    console.log('[CameraProxy] HTTP 代理请求:', req.method, transport, requestPath, '->', target.toString());

    const options = {
      hostname: target.hostname,
      port: target.port || 80,
      path: requestPath,
      method: req.method,
      headers: {
        ...req.headers,
        host: target.host,
      },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        ...proxyRes.headers,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('[CameraProxy] HTTP 代理错误:', err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Camera not reachable', target: target.toString() }));
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
  return function (req, res, next) {
    httpProxy(req, res, () => middleware(req, res, next));
  };
};

module.exports = finalConfig;
