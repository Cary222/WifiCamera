/* eslint-disable max-lines-per-function */

import { useCameraStore } from './camera-store';

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

  message(data: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

const OriginalWebSocket = globalThis.WebSocket;

describe('camera store', () => {
  beforeEach(() => {
    useCameraStore.getState().disconnect();
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    useCameraStore.setState({
      cameraStatus: 'idle',
      connectionStatus: 'idle',
      exposureConfigs: [
        { id: 2, name: 'Full Moon', exposure_time: 0.003, gain: 1 },
      ],
      currentExposureConfig: {
        id: 2,
        name: 'Full Moon',
        exposure_time: 0.003,
        gain: 1,
      },
      streamingInProgress: false,
      powerLevel: 4,
      inCharge: false,
      usedSpace: null,
      allSpace: null,
      serial: null,
      version: null,
      newestCameraJpgUrl: '',
      newestStreamJpgUrl: '',
      remainingExposureTime: 0,
      landscapeAutoMode: true,
      landscapeShutterMode: 'auto',
      landscapeManualExposure: 0.001,
      landscapeManualGain: 0,
    });
  });

  afterEach(() => {
    useCameraStore.getState().disconnect();
    jest.useRealTimers();
  });

  afterAll(() => {
    globalThis.WebSocket = OriginalWebSocket;
  });

  it('updates camera status and hardware status', () => {
    useCameraStore.getState().setCameraStatus('in_exposure');
    useCameraStore.getState().setPower(3.85, 1);
    useCameraStore.getState().setDisk(20, 100);

    expect(useCameraStore.getState()).toMatchObject({
      cameraStatus: 'in_exposure',
      powerLevel: 3.85,
      inCharge: true,
      usedSpace: 20,
      allSpace: 100,
    });
  });

  it('adds, updates, selects, and deletes exposure configs', () => {
    useCameraStore.getState().addExposureConfig({
      name: 'Test',
      exposure_time: 1,
      gain: 20,
    });
    const added = useCameraStore.getState().currentExposureConfig;

    expect(added).toMatchObject({ name: 'Test', exposure_time: 1, gain: 20 });
    expect(useCameraStore.getState().exposureConfigs).toContainEqual(added);

    useCameraStore.getState().updateExposureConfig({ ...added, gain: 30 });
    expect(useCameraStore.getState().currentExposureConfig.gain).toBe(30);

    useCameraStore.getState().deleteExposureConfig(added.id);
    expect(useCameraStore.getState().exposureConfigs).not.toContainEqual(
      expect.objectContaining({ id: added.id }),
    );
  });

  it('freezes the latest board AE values when entering manual mode', () => {
    jest.useFakeTimers();
    useCameraStore.getState().connect();
    const socket = MockWebSocket.instances[0];
    socket.open();

    socket.message({
      device_name: 'main_camera',
      instruction: 'camera_state',
      data: { preview: { exposure_s: 0.0125, gain: 14.6 } },
    });
    useCameraStore.getState().switchAutoMode(false);
    socket.message({
      device_name: 'main_camera',
      instruction: 'camera_state',
      data: { preview: { exposure_s: 0.0075, gain: 6.4 } },
    });

    expect(useCameraStore.getState()).toMatchObject({
      landscapeAutoMode: false,
      landscapeShutterMode: 'pro',
      landscapeManualExposure: 0.0075,
      landscapeManualGain: 6,
    });
    expect(socket.sent.slice(-2).map(message => JSON.parse(message))).toMatchObject([
      { instruction: 'camera_state' },
      { instruction: 'change_streaming_setting', params: [0.0075, 6] },
    ]);

    socket.message({
      device_name: 'main_camera',
      instruction: 'change_streaming_setting',
      data: true,
    });
    expect(socket.sent.slice(-1).map(message => JSON.parse(message))).toMatchObject([
      { instruction: 'switch_auto_mode', params: [1] },
    ]);
    jest.advanceTimersByTime(300);
    expect(socket.sent).toHaveLength(5);
  });

  it('falls back to the most recent valid AE cache when state refresh times out', () => {
    jest.useFakeTimers();
    useCameraStore.setState({
      landscapeManualExposure: 0.025,
      landscapeManualGain: 18,
    });
    useCameraStore.getState().connect();
    const socket = MockWebSocket.instances[0];
    socket.open();

    useCameraStore.getState().switchAutoMode(false);
    jest.advanceTimersByTime(400);

    expect(useCameraStore.getState()).toMatchObject({
      landscapeAutoMode: false,
      landscapeManualExposure: 0.025,
      landscapeManualGain: 18,
    });
    expect(socket.sent.slice(-1).map(message => JSON.parse(message))).toMatchObject([
      { instruction: 'change_streaming_setting', params: [0.025, 18] },
    ]);

    jest.advanceTimersByTime(300);
    expect(socket.sent.slice(-1).map(message => JSON.parse(message))).toMatchObject([
      { instruction: 'switch_auto_mode', params: [1] },
    ]);
  });
});
