/* eslint-disable max-lines-per-function */
import type {
  CameraJsonMessage,
  CameraWebSocketMessage,
} from './websocket-protocol';
import { appLogger } from '@/lib/app-logger';
import {
  parseCameraWebSocketMessage,
  serializeCameraJsonMessage,
} from './websocket-protocol';

export type CameraWebSocketStatus = 'connecting' | 'open' | 'closed' | 'error';

export type CameraWebSocketOptions = {
  url: string;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
  /** Keep retrying after the finite attempt limit for long-lived camera links. */
  retryForever?: boolean;
  /** Keep-alive heartbeat interval in milliseconds (defaults to 3000ms, 0 disables). */
  heartbeatIntervalMs?: number;
  onMessage?: (message: CameraWebSocketMessage) => void;
  onParseError?: (error: unknown) => void;
  onStatusChange?: (status: CameraWebSocketStatus) => void;
  /** Called after all reconnect attempts are exhausted (never retried again). */
  onGiveUp?: () => void;
};

export class CameraWebSocketService {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private manuallyClosed = false;
  private reconnectAttempts = 0;
  /** Timeout handle for the initial connection attempt. */
  private connectTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly options: Required<Pick<CameraWebSocketOptions, 'reconnectDelayMs' | 'maxReconnectAttempts' | 'retryForever' | 'heartbeatIntervalMs'>>
    & Omit<CameraWebSocketOptions, 'reconnectDelayMs' | 'maxReconnectAttempts' | 'retryForever' | 'heartbeatIntervalMs'>;

  constructor(options: CameraWebSocketOptions) {
    this.options = {
      ...options,
      reconnectDelayMs: options.reconnectDelayMs ?? 1_000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
      retryForever: options.retryForever ?? false,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 3_000,
    };
  }

  connect(): void {
    this.manuallyClosed = false;
    this.clearReconnectTimer();
    this.clearConnectTimeout();

    // Detailed state logging for debugging
    const socketInfo = this.socket
      ? {
          readyState: this.socket.readyState,
          OPEN: WebSocket.OPEN,
          CONNECTING: WebSocket.CONNECTING,
          CLOSING: WebSocket.CLOSING,
          CLOSED: WebSocket.CLOSED,
        }
      : null;
    console.log('[CameraWS] connect() 被调用', {
      hasSocket: !!this.socket,
      socketInfo,
      manuallyClosed: this.manuallyClosed,
    });

    // Close existing socket if it exists but is not in a good state
    if (this.socket) {
      if (this.socket.readyState === WebSocket.OPEN) {
        console.log('[CameraWS] 连接已存在且正常，无需重连');
        return;
      }
      if (this.socket.readyState === WebSocket.CONNECTING) {
        console.log('[CameraWS] 连接进行中，等待完成');
        return;
      }
      // For CLOSED, CLOSING, or ERROR states, close and recreate
      console.log('[CameraWS] 关闭旧连接', { state: this.socket.readyState });
      try {
        this.socket.close();
      }
      catch {}
      this.socket = null;
    }

    console.log('[CameraWS] 创建新连接:', this.options.url);
    this.options.onStatusChange?.('connecting');
    appLogger.info('WS', '开始连接控制通道', { url: this.options.url });

    // Safety timeout: if the socket doesn't open within 4s, treat it as unreachable.
    this.connectTimeout = setTimeout(() => {
      if (this.socket && this.socket.readyState !== WebSocket.OPEN) {
        this.socket.close();
        this.handleConnectionFailed();
      }
      this.connectTimeout = null;
    }, 4_000);

    const socket = new WebSocket(this.options.url);
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket)
        return;
      this.clearConnectTimeout();
      this.reconnectAttempts = 0;
      appLogger.info('WS', '控制通道已连接');
      console.log('[CameraWS] ✅ 连接成功');
      this.startHeartbeatTimer();
      this.options.onStatusChange?.('open');
    };
    socket.onmessage = async (event) => {
      if (this.socket !== socket)
        return;
      try {
        const data = event.data;
        const binaryData = isBlobLike(data)
          ? await data.arrayBuffer()
          : data;

        if (this.socket !== socket)
          return;

        if (typeof binaryData === 'string' || isArrayBufferLike(binaryData)) {
          this.options.onMessage?.(parseCameraWebSocketMessage(binaryData));
        }
      }
      catch (error) {
        console.error('[CameraWS] 消息解析错误:', error);
        // Parse errors don't kill the connection — just log and ignore
        this.options.onParseError?.(error);
        // Don't trigger error status for parse errors — it's not a connection problem
      }
    };
    socket.onerror = (event) => {
      if (this.socket !== socket)
        return;
      console.error('[CameraWS] ❌ 连接错误:', this.options.url, {
        readyState: socket.readyState,
        OPEN: WebSocket.OPEN,
        CLOSED: WebSocket.CLOSED,
      });
      this.clearHeartbeatTimer();
      appLogger.error('WS', '控制通道发生错误', {
        url: this.options.url,
        readyState: socket.readyState,
        event: event?.type,
      });
      this.options.onStatusChange?.('error');
      // Close socket immediately to force reconnect
      try {
        socket.close();
      }
      catch {}
      if (this.socket === socket) {
        this.socket = null;
      }
    };
    socket.onclose = (event) => {
      if (this.socket !== socket)
        return;
      this.clearConnectTimeout();
      this.clearHeartbeatTimer();
      this.socket = null;
      appLogger.warn('WS', '控制通道已断开', {
        url: this.options.url,
        code: event?.code,
        reason: event?.reason,
        wasClean: event?.wasClean,
      });
      console.warn('[CameraWS] 连接断开:', this.options.url, event?.code, event?.reason);
      this.options.onStatusChange?.('closed');
      this.scheduleReconnect();
    };
  }

  close(): void {
    this.manuallyClosed = true;
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();
    this.clearConnectTimeout();
    this.clearHeartbeatTimer();
    const socket = this.socket;
    this.socket = null;

    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.close();
    }

    this.options.onStatusChange?.('closed');
  }

  send(message: CameraJsonMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Camera WebSocket is not open');
    }

    this.socket.send(serializeCameraJsonMessage(message));
    if (message.instruction !== 'HeartBeat')
      appLogger.debug('WS', '发送相机指令', message);
  }

  private handleConnectionFailed(): void {
    if (this.manuallyClosed)
      return;
    appLogger.error('WS', '连接失败，准备重试', {
      retryForever: this.options.retryForever,
      attempts: this.reconnectAttempts,
    });
    this.options.onStatusChange?.('error');
    if (this.options.retryForever) {
      this.scheduleReconnect();
      return;
    }
    this.options.onGiveUp?.();
  }

  private scheduleReconnect(): void {
    if (this.manuallyClosed || this.reconnectTimer)
      return;
    if (!this.options.retryForever && this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.handleConnectionFailed();
      return;
    }

    this.reconnectAttempts += 1;
    appLogger.info('WS', `将在 ${this.options.reconnectDelayMs}ms 后重连`, { attempt: this.reconnectAttempts });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.options.reconnectDelayMs);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer)
      return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private startHeartbeatTimer(): void {
    this.clearHeartbeatTimer();
    if (this.options.heartbeatIntervalMs <= 0)
      return;
    this.heartbeatTimer = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        try {
          this.socket.send(serializeCameraJsonMessage({ device_name: 'StartUp', instruction: 'HeartBeat' }));
        }
        catch {}
      }
    }, this.options.heartbeatIntervalMs);
  }

  private clearHeartbeatTimer(): void {
    if (!this.heartbeatTimer)
      return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private clearConnectTimeout(): void {
    if (!this.connectTimeout)
      return;
    clearTimeout(this.connectTimeout);
    this.connectTimeout = null;
  }
}

type BlobLike = {
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function isArrayBufferLike(value: unknown): value is ArrayBuffer {
  return typeof value === 'object'
    && value !== null
    && 'byteLength' in value
    && 'slice' in value
    && typeof value.slice === 'function';
}

function isBlobLike(value: unknown): value is BlobLike {
  return typeof value === 'object'
    && value !== null
    && 'arrayBuffer' in value
    && typeof value.arrayBuffer === 'function';
}
