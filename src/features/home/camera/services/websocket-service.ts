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

    if (this.socket?.readyState === WebSocket.OPEN
      || this.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.options.onStatusChange?.('connecting');
    appLogger.info('WS', '开始连接控制通道', { url: this.options.url });

    // Safety timeout: if the socket doesn't open within 4s, treat it as unreachable.
    // This handles browsers that fire `onerror` immediately (no onclose) for
    // cross-origin connection-refused errors.
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
        this.options.onParseError?.(error);
        this.options.onStatusChange?.('error');
      }
    };
    socket.onerror = () => {
      if (this.socket !== socket)
        return;
      this.clearHeartbeatTimer();
      appLogger.warn('WS', '控制通道发生错误');
      this.options.onStatusChange?.('error');
    };
    socket.onclose = () => {
      if (this.socket !== socket)
        return;
      this.clearConnectTimeout();
      this.clearHeartbeatTimer();
      this.socket = null;
      appLogger.warn('WS', '控制通道已断开');
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
