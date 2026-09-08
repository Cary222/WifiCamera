/* eslint-disable max-lines-per-function */
import type { CameraWebSocketStatus } from './websocket-service';
import {
  CameraWebSocketService,

} from './websocket-service';

type Listener = ((event?: unknown) => void | Promise<void>) | null;

class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CONNECTING = 0;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: Listener = null;
  onmessage: Listener = null;
  onerror: Listener = null;
  onclose: Listener = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(message: string) {
    this.sent.push(message);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  message(data: string | ArrayBuffer) {
    this.onmessage?.({ data });
  }

  fail() {
    this.onerror?.();
  }

  finish() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

const OriginalWebSocket = globalThis.WebSocket;

beforeEach(() => {
  MockWebSocket.instances = [];
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
});

afterAll(() => {
  globalThis.WebSocket = OriginalWebSocket;
});

describe('cameraWebSocketService', () => {
  it('connects, sends JSON, and parses incoming messages', () => {
    const messages: unknown[] = [];
    const statuses: CameraWebSocketStatus[] = [];
    const service = new CameraWebSocketService({
      url: 'ws://192.168.1.1:8999/ws/device/',
      onMessage: message => messages.push(message),
      onStatusChange: status => statuses.push(status),
    });

    service.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    service.send({ method: 'ping' });
    socket.message('{"instruction":"ready"}');

    expect(socket.sent).toEqual(['{"method":"ping"}']);
    expect(messages).toEqual([{ instruction: 'ready' }]);
    expect(statuses).toEqual(['connecting', 'open']);
    service.close();
  });

  it('reports errors and reconnects after an unexpected close', () => {
    jest.useFakeTimers();
    const statuses: CameraWebSocketStatus[] = [];
    const service = new CameraWebSocketService({
      url: 'ws://camera/ws/device/',
      reconnectDelayMs: 250,
      onStatusChange: status => statuses.push(status),
    });

    service.connect();
    const socket = MockWebSocket.instances[0];
    socket.fail();
    socket.finish();
    jest.advanceTimersByTime(250);

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(statuses).toEqual(['connecting', 'error', 'closed', 'connecting']);
    jest.useRealTimers();
  });

  it('does not reconnect when close is an explicit user disconnect', () => {
    jest.useFakeTimers();
    const service = new CameraWebSocketService({ url: 'ws://camera/', reconnectDelayMs: 250 });
    service.connect();
    const socket = MockWebSocket.instances[0];
    service.close();
    socket.finish();
    jest.advanceTimersByTime(1_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('stays connected on the same socket when an open link reports a transient error', () => {
    jest.useFakeTimers();
    const service = new CameraWebSocketService({ url: 'ws://camera/', reconnectDelayMs: 250 });
    service.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    service.send({ method: 'ping' });
    socket.fail();
    jest.advanceTimersByTime(1_000);
    expect(MockWebSocket.instances).toHaveLength(1);
    service.send({ method: 'capture' });
    expect(socket.sent).toEqual(['{"method":"ping"}', '{"method":"capture"}']);
    socket.finish();
    jest.advanceTimersByTime(250);
    expect(MockWebSocket.instances).toHaveLength(2);
    service.close();
  });

  it('retries a closed WiFi link so USB/WiFi fallback probes get time to run', () => {
    const service = new CameraWebSocketService({ url: 'ws://camera/', reconnectDelayMs: 250, retryForever: true });
    service.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.fail();
    socket.finish();
    jest.advanceTimersByTime(250);
    expect(MockWebSocket.instances).toHaveLength(2);
    MockWebSocket.instances[1].open();
    service.send({ method: 'ping' });
    expect(MockWebSocket.instances[1].sent).toEqual(['{"method":"ping"}']);
    service.close();
  });

  it('survives an application double-connect at startup and reconnects cleanly', () => {
    jest.useFakeTimers();
    const service = new CameraWebSocketService({ url: 'ws://camera/', reconnectDelayMs: 250, retryForever: true });
    service.connect();
    service.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.close();
    socket.finish();
    jest.advanceTimersByTime(250);
    expect(MockWebSocket.instances).toHaveLength(2);
    MockWebSocket.instances[1].open();
    service.send({ method: 'ping' });
    expect(MockWebSocket.instances[1].sent).toEqual(['{"method":"ping"}']);
    service.close();
  });

  it('stops reconnecting after the configured attempt limit', () => {
    jest.useFakeTimers();
    const service = new CameraWebSocketService({
      url: 'ws://camera/ws/device/',
      reconnectDelayMs: 250,
      maxReconnectAttempts: 2,
    });

    service.connect();
    MockWebSocket.instances[0].finish();
    jest.advanceTimersByTime(250);
    MockWebSocket.instances[1].finish();
    jest.advanceTimersByTime(250);
    MockWebSocket.instances[2].finish();
    jest.advanceTimersByTime(250);

    expect(MockWebSocket.instances).toHaveLength(3);
    jest.useRealTimers();
  });

  it('continues reconnecting after the finite limit when retryForever is enabled', () => {
    jest.useFakeTimers();
    const service = new CameraWebSocketService({
      url: 'ws://camera/ws/device/',
      reconnectDelayMs: 250,
      maxReconnectAttempts: 1,
      retryForever: true,
    });

    service.connect();
    MockWebSocket.instances[0].finish();
    jest.advanceTimersByTime(250);
    MockWebSocket.instances[1].finish();
    jest.advanceTimersByTime(250);
    MockWebSocket.instances[2].finish();
    jest.advanceTimersByTime(250);

    expect(MockWebSocket.instances).toHaveLength(4);
    service.close();
    jest.useRealTimers();
  });

  it('does not reconnect after an explicit close', () => {
    jest.useFakeTimers();
    const service = new CameraWebSocketService({
      url: 'ws://camera/ws/device/',
      reconnectDelayMs: 250,
    });

    service.connect();
    service.close();
    jest.advanceTimersByTime(250);

    expect(MockWebSocket.instances).toHaveLength(1);
    jest.useRealTimers();
  });

  it('rejects sends while disconnected', () => {
    const service = new CameraWebSocketService({ url: 'ws://camera/ws/device/' });

    expect(() => service.send({ method: 'ping' })).toThrow('not open');
  });

  describe('automatic recovery', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('reconnects when error is followed by an asynchronous close', () => {
      const service = new CameraWebSocketService({ url: 'ws://camera/', reconnectDelayMs: 250 });
      service.connect();
      const socket = MockWebSocket.instances[0];
      socket.close = () => {
        socket.readyState = 2;
        setTimeout(() => socket.finish(), 50);
      };
      socket.fail();
      jest.advanceTimersByTime(250);
      expect(MockWebSocket.instances).toHaveLength(2);
      MockWebSocket.instances[1].open();
      service.send({ method: 'ping' });
      expect(MockWebSocket.instances[1].sent).toEqual(['{"method":"ping"}']);
      service.close();
    });

    it('recovers even when closing a failed socket throws', () => {
      const service = new CameraWebSocketService({ url: 'ws://camera/', reconnectDelayMs: 250 });
      service.connect();
      const socket = MockWebSocket.instances[0];
      socket.close = () => {
        throw new Error('native socket is gone');
      };
      socket.fail();
      jest.advanceTimersByTime(250);
      expect(MockWebSocket.instances).toHaveLength(2);
      service.close();
    });

    it('keeps the connection deadline when connect is called again', () => {
      const service = new CameraWebSocketService({ url: 'ws://camera/', reconnectDelayMs: 250, retryForever: true });
      service.connect();
      jest.advanceTimersByTime(2_000);
      service.connect();
      jest.advanceTimersByTime(2_250);
      expect(MockWebSocket.instances).toHaveLength(2);
      service.close();
    });

    it('uses the retry budget before giving up on connection timeouts', () => {
      const onGiveUp = jest.fn();
      const service = new CameraWebSocketService({ url: 'ws://camera/', reconnectDelayMs: 250, maxReconnectAttempts: 1, onGiveUp });
      service.connect();
      jest.advanceTimersByTime(4_000);
      expect(onGiveUp).not.toHaveBeenCalled();
      jest.advanceTimersByTime(4_250);
      expect(MockWebSocket.instances).toHaveLength(2);
      expect(onGiveUp).toHaveBeenCalledTimes(1);
      service.close();
    });

    it('recovers after a heartbeat send failure without replaying commands', () => {
      const service = new CameraWebSocketService({ url: 'ws://camera/', reconnectDelayMs: 250, heartbeatIntervalMs: 1_000 });
      service.connect();
      const socket = MockWebSocket.instances[0];
      socket.open();
      service.send({ instruction: 'capture_stream_frame' });
      socket.send = () => {
        throw new Error('connection lost');
      };
      jest.advanceTimersByTime(1_250);
      expect(MockWebSocket.instances).toHaveLength(2);
      MockWebSocket.instances[1].open();
      expect(MockWebSocket.instances[1].sent).toEqual([]);
      service.close();
    });

    it('ignores stale callbacks and cancels retries after a manual close', () => {
      const service = new CameraWebSocketService({ url: 'ws://camera/', reconnectDelayMs: 250, retryForever: true });
      service.connect();
      const oldSocket = MockWebSocket.instances[0];
      oldSocket.fail();
      jest.advanceTimersByTime(250);
      MockWebSocket.instances[1].open();
      oldSocket.finish();
      oldSocket.fail();
      jest.advanceTimersByTime(250);
      expect(MockWebSocket.instances).toHaveLength(2);
      service.close();
      oldSocket.finish();
      jest.advanceTimersByTime(10_000);
      expect(MockWebSocket.instances).toHaveLength(2);
    });
  });

  it('sends periodic keep-alive heartbeats while open', () => {
    jest.useFakeTimers();
    const service = new CameraWebSocketService({
      url: 'ws://camera/ws/device/',
      heartbeatIntervalMs: 2_000,
    });

    service.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();

    jest.advanceTimersByTime(2_000);
    expect(socket.sent).toEqual(['{"device_name":"StartUp","instruction":"HeartBeat"}']);

    jest.advanceTimersByTime(2_000);
    expect(socket.sent).toHaveLength(2);

    service.close();
    jest.advanceTimersByTime(2_000);
    expect(socket.sent).toHaveLength(2);
    jest.useRealTimers();
  });
});
