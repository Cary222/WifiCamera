/* eslint-disable max-lines-per-function */

import {
  formatCameraErrorMessage,
  mapBoardStateToCameraStatus,
  mapLegacyStatusToCameraStatus,
  useCameraStore,
} from './camera-store';

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
      landscapeManualExposure: 0.08,
      landscapeManualGain: 24,
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

    // Switch back to manual mode; should immediately switch to manual and apply user's saved manual settings (0.05s, code 30)
    useCameraStore.getState().switchAutoMode(false);

    expect(useCameraStore.getState()).toMatchObject({
      landscapeAutoMode: false,
      landscapeShutterMode: 'pro',
      landscapeManualExposure: 0.05,
      landscapeManualGain: 30,
    });
    expect(
      socket.sent.slice(-2).map(message => JSON.parse(message)),
    ).toMatchObject([
      { instruction: 'switch_auto_mode', params: [1] },
      { instruction: 'change_streaming_setting', params: [0.05, 30] },
    ]);
  });

  it('waits for start_streaming_exposure before resolving', async () => {
    useCameraStore.getState().connect();
    const socket = MockWebSocket.instances[0];
    socket.open();

    const pending = useCameraStore.getState().startStreaming('auto');
    const sent = socket.sent
      .map(message => JSON.parse(message))
      .find(message => message.instruction === 'start_streaming_exposure');
    expect(sent).toMatchObject({
      instruction: 'start_streaming_exposure',
      params: ['auto', -1],
    });
    expect(typeof sent.id).toBe('string');

    socket.message({
      device_name: 'main_camera',
      instruction: 'start_streaming_exposure',
      id: sent.id,
      success: true,
      data: true,
    });

    const result = await pending;
    expect(result.timeout).toBeUndefined();
    expect(result.error).toBeUndefined();
    expect(result.msg).toMatchObject({ success: true });
  });

  it('completes stream-frame capture from camera_state last_result', () => {
    jest.useFakeTimers();
    useCameraStore.getState().connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.message({
      device_name: 'main_camera',
      instruction: 'camera_state',
      data: { busy: 'streaming', streaming: true },
    });
    useCameraStore.getState().startLandscapeCapture();

    const capture = socket.sent
      .map(message => JSON.parse(message))
      .find(message => message.instruction === 'capture_stream_frame');
    expect(capture.params[0]).toMatch(
      /^\/mnt\/sdcard\/Pictures\/stream_frame_\d+\.jpg$/,
    );
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
    expect(
      socket.sent.slice(-2).map(message => JSON.parse(message)),
    ).toMatchObject([
      { instruction: 'switch_auto_mode', params: [1] },
      { instruction: 'change_streaming_setting', params: [0.025, 18] },
    ]);
  });

  it('starts landscape repeat, sends capture command, and advances count', () => {
    jest.useFakeTimers();
    useCameraStore.getState().connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.message({
      device_name: 'main_camera',
      instruction: 'camera_state',
      data: { busy: 'streaming', streaming: true },
    });
    useCameraStore.getState().setLandscapeTimerPlan({ count: 2, interval: 1 });
    useCameraStore.getState().startLandscapeRepeat();

    expect(useCameraStore.getState().landscapeRepeatState).toBe('running');
    const firstCapture = socket.sent
      .map(message => JSON.parse(message))
      .find(message => message.instruction === 'capture_stream_frame');
    expect(firstCapture).toBeDefined();
    expect(useCameraStore.getState().landscapeCaptureState).toBe('capturing');

    // Complete step 1
    socket.message({
      device_name: 'main_camera',
      instruction: 'camera_state',
      data: {
        streaming: true,
        last_result: { jpg_path: firstCapture.params[0] },
      },
    });

    expect(useCameraStore.getState().landscapeRepeatCurrent).toBe(1);
    expect(useCameraStore.getState().landscapeRepeatState).toBe('running');

    // Cancel repeat
    useCameraStore.getState().cancelLandscapeRepeat();
    expect(useCameraStore.getState().landscapeRepeatState).toBe('idle');
  });

  it('aborts capturing, recording, and repeat immediately when camera_state reports busy error', () => {
    useCameraStore.getState().connect();
    const socket = MockWebSocket.instances[0];
    socket.open();

    useCameraStore.setState({
      landscapeCaptureState: 'capturing',
      landscapeRepeatState: 'running',
      landscapeRecordingState: 'recording',
    });

    socket.message({
      device_name: 'main_camera',
      instruction: 'camera_state',
      data: {
        busy: 'error',
        streaming: false,
      },
    });

    expect(useCameraStore.getState()).toMatchObject({
      landscapeCaptureState: 'idle',
      landscapeRepeatState: 'idle',
      landscapeRecordingState: 'idle',
      lastCommandError: '相机状态异常(error)，请重启相机',
    });
  });

  it('maps board states and legacy status according to protocol table', () => {
    expect(mapBoardStateToCameraStatus({ busy: 'idle' })).toBe('idle');
    expect(mapBoardStateToCameraStatus({ busy: 'streaming' })).toBe(
      'in_streaming',
    );
    expect(mapBoardStateToCameraStatus({ busy: 'recording' })).toBe(
      'recording',
    );
    expect(mapBoardStateToCameraStatus({ busy: 'repeating' })).toBe(
      'in_repeat',
    );
    expect(mapBoardStateToCameraStatus({ busy: 'exposing' })).toBe(
      'in_exposure',
    );
    expect(mapBoardStateToCameraStatus({ busy: 'starting' })).toBe('starting');
    expect(mapBoardStateToCameraStatus({ busy: 'stopping' })).toBe('stopping');
    expect(mapBoardStateToCameraStatus({ busy: 'closed' })).toBe('closed');
    expect(mapBoardStateToCameraStatus({ busy: 'error' })).toBe('error');
    expect(
      mapBoardStateToCameraStatus({ fault_active: true, busy: 'streaming' }),
    ).toBe('error');
    expect(mapBoardStateToCameraStatus({ busy: 'other_unknown' })).toBe(
      'unknown',
    );
    expect(mapBoardStateToCameraStatus(null)).toBe('unknown');

    expect(mapLegacyStatusToCameraStatus('idle')).toBe('idle');
    expect(mapLegacyStatusToCameraStatus('in_streaming')).toBe('in_streaming');
    expect(mapLegacyStatusToCameraStatus('error')).toBe('error');
    expect(mapLegacyStatusToCameraStatus('invalid')).toBe('unknown');
  });

  it('formats structured error responses and ignores see data placeholders', () => {
    const structured = formatCameraErrorMessage({
      error: { code: -7, name: 'ADAPTER', operation: 'record_stop' },
      message: 'see data',
    });
    expect(structured).toBe('record_stop: ADAPTER(-7)');

    const plainErr = formatCameraErrorMessage({
      error: 'NOT_READY',
      message: 'see data',
    });
    expect(plainErr).toBe('NOT_READY');

    const seeDataOnly = formatCameraErrorMessage({ message: 'see data' });
    expect(seeDataOnly).toBe('操作失败');
  });

  it('drops stale snapshots based on seq within connection', () => {
    useCameraStore.getState().connect();
    const socket = MockWebSocket.instances[0];
    socket.open();

    socket.message({
      device_name: 'main_camera',
      instruction: 'camera_state',
      data: { seq: 10, busy: 'streaming', streaming: true },
    });
    expect(useCameraStore.getState().cameraStatus).toBe('in_streaming');

    // Stale snapshot with smaller seq must be ignored
    socket.message({
      device_name: 'main_camera',
      instruction: 'camera_state',
      data: { seq: 9, busy: 'idle', streaming: false },
    });
    expect(useCameraStore.getState().cameraStatus).toBe('in_streaming');
  });

  it('prioritizes detailed camera_state and ignores legacy get_camera_status overwrites', () => {
    useCameraStore.getState().connect();
    const socket = MockWebSocket.instances[0];
    socket.open();

    socket.message({
      device_name: 'main_camera',
      instruction: 'camera_state',
      data: { seq: 1, busy: 'recording', recording: true },
    });
    expect(useCameraStore.getState().cameraStatus).toBe('recording');

    // Legacy response arrives late — must NOT overwrite detailed cameraStatus
    socket.message({
      device_name: 'main_camera',
      instruction: 'get_camera_status',
      data: 'idle',
    });
    expect(useCameraStore.getState().cameraStatus).toBe('recording');
  });

  it('handles command failure without forcing in_streaming and formats error', () => {
    useCameraStore.getState().connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    useCameraStore.setState({ landscapeRecordingState: 'recording' });

    socket.message({
      device_name: 'main_camera',
      instruction: 'streaming_stop_save',
      success: false,
      message: 'see data',
      error: { code: -7, name: 'ADAPTER', operation: 'record_stop' },
    });

    expect(useCameraStore.getState().lastCommandError).toBe(
      'record_stop: ADAPTER(-7)',
    );
    expect(useCameraStore.getState().landscapeRecordingState).toBe('idle');
    // cameraStatus was NOT falsely set to in_streaming
    expect(useCameraStore.getState().cameraStatus).not.toBe('in_streaming');

    // Checks that camera_state was requested to refresh authoritative state
    const lastSent = socket.sent.map(m => JSON.parse(m)).pop();
    expect(lastSent.instruction).toBe('camera_state');
  });
});
