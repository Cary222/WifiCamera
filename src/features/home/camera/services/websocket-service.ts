import type {
  CameraJsonMessage,
  CameraWebSocketMessage,
} from './websocket-protocol';
import {
  parseCameraWebSocketMessage,
  serializeCameraJsonMessage,
} from './websocket-protocol';

export type CameraWebSocketStatus = 'connecting' | 'open' | 'closed' | 'error';

export type CameraWebSocketOptions = {
  url: string;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
  onMessage?: (message: CameraWebSocketMessage) => void;
  onParseError?: (error: unknown) => void;
  onStatusChange?: (status: CameraWebSocketStatus) => void;
};

export class CameraWebSocketService {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyClosed = false;
  private reconnectAttempts = 0;
  private readonly options: Required<Pick<CameraWebSocketOptions, 'reconnectDelayMs' | 'maxReconnectAttempts'>>
    & Omit<CameraWebSocketOptions, 'reconnectDelayMs' | 'maxReconnectAttempts'>;

  constructor(options: CameraWebSocketOptions) {
    this.options = {
      ...options,
      reconnectDelayMs: options.reconnectDelayMs ?? 1_000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
    };
  }

  connect(): void {
    this.manuallyClosed = false;
    this.clearReconnectTimer();

    if (this.socket?.readyState === WebSocket.OPEN
      || this.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.options.onStatusChange?.('connecting');
    const socket = new WebSocket(this.options.url);
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket)
        return;
      this.reconnectAttempts = 0;
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
      this.options.onStatusChange?.('error');
    };
    socket.onclose = () => {
      if (this.socket !== socket)
        return;
      this.socket = null;
      this.options.onStatusChange?.('closed');
      this.scheduleReconnect();
    };
  }

  close(): void {
    this.manuallyClosed = true;
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();
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
  }

  private scheduleReconnect(): void {
    if (this.manuallyClosed || this.reconnectTimer)
      return;
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.options.onStatusChange?.('error');
      return;
    }

    this.reconnectAttempts += 1;
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
