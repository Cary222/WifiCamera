import { act, renderHook } from '@testing-library/react-native';
import { useCameraStore } from '../camera-store';
import { useNebulaCapture } from './use-nebula-capture';

type Listener = ((event?: { data?: string }) => void) | null;

class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CONNECTING = 0;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: Listener = null;
  onmessage: Listener = null;
  onerror: Listener = null;
  onclose: Listener = null;

  constructor(_url: string) {
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
}

const OriginalWebSocket = globalThis.WebSocket;

function connectStore() {
  useCameraStore.getState().connect();
  MockWebSocket.instances[0].open();
}

function sentInstructions(): string[] {
  return MockWebSocket.instances.flatMap(ws => ws.sent.map((raw) => {
    try {
      return JSON.parse(raw).instruction as string;
    }
    catch {
      return '';
    }
  }));
}

describe('useNebulaCapture countdown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useCameraStore.getState().disconnect();
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    useCameraStore.setState({
      cameraStatus: 'idle',
      connectionStatus: 'idle',
    });
    connectStore();
  });

  afterEach(() => {
    useCameraStore.getState().disconnect();
    globalThis.WebSocket = OriginalWebSocket;
    jest.useRealTimers();
  });

  it('shows the full duration immediately and starts exposure exactly once', () => {
    const { result } = renderHook(() => useNebulaCapture({ exposure: 0.008, gain: 6 }));

    act(() => {
      result.current.startCountdown(3);
    });
    // The countdown value is visible from the first frame, not after one tick.
    expect(result.current.captureState).toBe('countdown');
    expect(result.current.countdownRemaining).toBe(3);
    expect(sentInstructions()).not.toContain('nebula_capture');

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.countdownRemaining).toBe(2);
    expect(sentInstructions()).not.toContain('nebula_capture');

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current.captureState).toBe('capturing');
    // Exactly one capture command even under re-rendered state updaters.
    expect(sentInstructions().filter(i => i === 'nebula_capture')).toHaveLength(1);
  });

  it('cancelling during countdown only clears local timers and never aborts the board', () => {
    const { result } = renderHook(() => useNebulaCapture({ exposure: 0.008, gain: 6 }));

    act(() => {
      result.current.startCountdown(3);
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    act(() => {
      result.current.cancel();
    });

    expect(result.current.captureState).toBe('idle');
    expect(result.current.countdownRemaining).toBe(0);
    expect(sentInstructions()).not.toContain('nebula_capture');
    expect(sentInstructions()).not.toContain('abort_exposure');
    expect(sentInstructions()).not.toContain('stop_repeat_exposure');

    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(sentInstructions()).not.toContain('nebula_capture');
  });

  it('cancelling an in-progress capture still aborts the board exposure', () => {
    const { result } = renderHook(() => useNebulaCapture({ exposure: 0.008, gain: 6 }));

    act(() => {
      result.current.capture();
    });
    expect(sentInstructions()).toContain('nebula_capture');

    act(() => {
      result.current.cancel();
    });
    expect(result.current.captureState).toBe('idle');
    expect(sentInstructions()).toContain('abort_exposure');
  });
});

describe('useNebulaCapture long exposure payload (星空模式 60s)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useCameraStore.getState().disconnect();
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    useCameraStore.setState({
      cameraStatus: 'idle',
      connectionStatus: 'idle',
    });
    connectStore();
  });

  afterEach(() => {
    useCameraStore.getState().disconnect();
    globalThis.WebSocket = OriginalWebSocket;
    jest.useRealTimers();
  });

  function capturedCommand(instruction: string) {
    return MockWebSocket.instances
      .flatMap(ws => ws.sent)
      .map(raw => JSON.parse(raw))
      .find(message => message.instruction === instruction);
  }

  it('sends a 60s exposure as plain seconds in nebula_capture', () => {
    const { result } = renderHook(() => useNebulaCapture({ exposure: 60, gain: 30 }));

    act(() => {
      result.current.capture();
    });

    expect(capturedCommand('nebula_capture')).toMatchObject({
      device_name: 'main_camera',
      instruction: 'nebula_capture',
      params: [60, 30, 1, 0],
    });
    expect(result.current.captureState).toBe('capturing');
  });

  it('keeps a 60s exposure running until the board finishes, not after one 60s frame window', () => {
    const { result } = renderHook(() => useNebulaCapture({ exposure: 60, gain: 30 }));

    act(() => {
      result.current.capture();
    });

    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(result.current.captureState).toBe('capturing');
    expect(sentInstructions()).not.toContain('abort_exposure');
  });

  it('carries the 60s exposure through a timed repeat payload', () => {
    const { result } = renderHook(() => useNebulaCapture({ exposure: 60, gain: 30 }));

    act(() => {
      result.current.capture({ count: 3, interval: 5 });
    });

    expect(capturedCommand('nebula_capture')).toMatchObject({
      params: [60, 30, 3, 5],
    });
  });

  it('ends immediately when the board rejects the exposure command', () => {
    const { result } = renderHook(() => useNebulaCapture({ exposure: 60, gain: 30 }));

    act(() => {
      result.current.capture();
    });
    expect(result.current.captureState).toBe('capturing');

    const socket = MockWebSocket.instances[0];
    const command = socket.sent
      .map(message => JSON.parse(message))
      .find(message => message.instruction === 'nebula_capture');
    act(() => {
      socket.onmessage?.({ data: JSON.stringify({
        device_name: 'main_camera',
        instruction: 'nebula_capture',
        id: command.id,
        success: false,
        message: 'command nebula_capture not callable',
      }) });
    });

    expect(result.current.captureState).toBe('idle');
  });
});
