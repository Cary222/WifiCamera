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
      landscapeCaptureState: 'idle',
      landscapeCapturePendingId: null,
      lastCommandError: null,
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

  it('preserves user configured manual exposure and gain across auto mode switches', () => {
    jest.useFakeTimers();
    useCameraStore.setState({
      landscapeManualExposure: 0.05,
      landscapeManualGain: 30,
      landscapeAutoMode: false,
      landscapeShutterMode: 'pro',
    });
    useCameraStore.getState().connect();
    const socket = MockWebSocket.instances[0];
    socket.open();

    // Switch to auto mode
    useCameraStore.getState().switchAutoMode(true);
    expect(useCameraStore.getState()).toMatchObject({
      landscapeAutoMode: true,
      landscapeShutterMode: 'auto',
      landscapeManualExposure: 0.05,
      landscapeManualGain: 30,
    });

    // Board reports AE values while in auto mode; user's manual settings must NOT be overwritten
    socket.message({
      device_name: 'main_camera',
      instruction: 'camera_state',
      data: { preview: { exposure_s: 0.0075, gain: 6.4 } },
    });

    expect(useCameraStore.getState()).toMatchObject({
      landscapeManualExposure: 0.05,
      landscapeManualGain: 30,
    });

    // Switch back to manual mode; should immediately switch to manual and apply user's saved manual settings (0.05s, 30dB)
    useCameraStore.getState().switchAutoMode(false);

    expect(useCameraStore.getState()).toMatchObject({
      landscapeAutoMode: false,
      landscapeShutterMode: 'pro',
      landscapeManualExposure: 0.05,
      landscapeManualGain: 30,
    });
    expect(socket.sent.slice(-2).map(message => JSON.parse(message))).toMatchObject([
      { instruction: 'switch_auto_mode', params: [1] },
      { instruction: 'change_streaming_setting', params: [0.05, 30] },
    ]);
  });

  it('completes stream-frame capture from camera_state last_result', () => {
    jest.useFakeTimers();
    useCameraStore.getState().connect();
    const socket = MockWebSocket.instances[0];
    socket.open();

    useCameraStore.getState().startLandscapeCapture();

    const capture = socket.sent
      .map(message => JSON.parse(message))
      .find(message => message.instruction === 'capture_stream_frame');
    expect(capture.params[0]).toMatch(/^\/mnt\/sdcard\/Pictures\/stream_frame_\d+\.jpg$/);
    expect(useCameraStore.getState().landscapeCaptureState).toBe('capturing');

    socket.message({
      device_name: 'main_camera',
      instruction: 'camera_state',
      data: {
        streaming: true,
        last_result: { jpg_path: capture.params[0] },
      },
    });

    expect(useCameraStore.getState()).toMatchObject({
      landscapeCaptureState: 'idle',
      newestCameraJpgUrl: capture.params[0],
      newestStreamJpgUrl: capture.params[0],
      lastCommandError: null,
    });
  });

  it('immediately applies manual settings and switches mode without waiting', () => {
    useCameraStore.setState({
      landscapeManualExposure: 0.025,
      landscapeManualGain: 18,
    });
    useCameraStore.getState().connect();
    const socket = MockWebSocket.instances[0];
    socket.open();

    useCameraStore.getState().switchAutoMode(false);

    expect(useCameraStore.getState()).toMatchObject({
      landscapeAutoMode: false,
      landscapeManualExposure: 0.025,
      landscapeManualGain: 18,
    });
    expect(socket.sent.slice(-2).map(message => JSON.parse(message))).toMatchObject([
      { instruction: 'switch_auto_mode', params: [1] },
      { instruction: 'change_streaming_setting', params: [0.025, 18] },
    ]);
  });
});
