/* eslint-disable max-lines-per-function */

import {
  formatCameraErrorMessage,
  mapBoardStateToCameraStatus,
  mapLegacyStatusToCameraStatus,
  normalizeCameraCommand,
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
      {
        instruction: 'change_streaming_setting',
        params: [0.05, 30],
        gain_unit: 'percent',
      },
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
      params: ['auto', null],
      gain_unit: 'percent',
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
      {
        instruction: 'change_streaming_setting',
        params: [0.025, 18],
        gain_unit: 'percent',
      },
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

  it('sends start_exposure when manual shutter is set to long exposure (30s)', () => {
    useCameraStore.getState().connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.message({
      device_name: 'main_camera',
      instruction: 'camera_state',
      data: { busy: 'streaming', streaming: true },
    });

    useCameraStore.setState({
      landscapeAutoMode: false,
      landscapeManualExposure: 30,
    });

    useCameraStore.getState().startLandscapeCapture();

    const exposureCmd = socket.sent
      .map(message => JSON.parse(message))
      .find(message => message.instruction === 'start_exposure');
    expect(exposureCmd).toBeDefined();
    expect(exposureCmd.params).toEqual([30, true, '', 'LANDSCAPE_SINGLE']);
    expect(useCameraStore.getState().landscapeCaptureState).toBe('capturing');
  });

  it('sends start_exposure_repeat when manual shutter is set to long exposure (60s) repeat', () => {
    useCameraStore.getState().connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.message({
      device_name: 'main_camera',
      instruction: 'camera_state',
      data: { busy: 'streaming', streaming: true },
    });

    useCameraStore.setState({
      landscapeAutoMode: false,
      landscapeManualExposure: 60,
    });
    useCameraStore.getState().setLandscapeTimerPlan({ count: 5, interval: 3 });

    useCameraStore.getState().startLandscapeRepeat();

    const repeatCmd = socket.sent
      .map(message => JSON.parse(message))
      .find(message => message.instruction === 'start_exposure_repeat');
    expect(repeatCmd).toBeDefined();
    expect(repeatCmd.params).toEqual([60, 5, true, '', 'LANDSCAPE_REPEAT']);
    expect(useCameraStore.getState().landscapeRepeatState).toBe('running');

    useCameraStore.getState().cancelLandscapeRepeat();
    expect(useCameraStore.getState().landscapeRepeatState).toBe('cancelling');
    const stopCmd = socket.sent
      .map(message => JSON.parse(message))
      .find(message => message.instruction === 'stop_exposure_repeat');
    expect(stopCmd).toBeDefined();
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
    expect(structured).toBe('停止录像失败：相机适配异常');

    const plainErr = formatCameraErrorMessage({
      error: 'NOT_READY',
      message: 'see data',
    });
    expect(plainErr).toBe('操作失败：相机尚未就绪');

    const seeDataOnly = formatCameraErrorMessage({ message: 'see data' });
    expect(seeDataOnly).toBe('操作失败');
  });

  it('formats set_stretch INVALID_PARAM without exposing raw name or code', () => {
    const formatted = formatCameraErrorMessage({
      device_name: 'main_camera',
      instruction: 'set_stretch',
      id: 'APP-x',
      success: false,
      message: 'see data',
      data: false,
      error: {
        code: -2,
        name: 'INVALID_PARAM',
        operation: 'set_stretch',
      },
    });
    expect(formatted).toBe('自动拉伸设置失败：参数无效');
    expect(formatted).not.toContain('INVALID_PARAM');
    expect(formatted).not.toContain('-2');
  });

  it('maps storage error object with CARD_FULL to friendly TF card message', () => {
    const formatted = formatCameraErrorMessage({
      error: { code: -23, name: 'CARD_FULL', operation: 'record_start' },
      message: 'see data',
    });
    expect(formatted).toBe('TF 卡空间不足');
  });

  it('maps unknown operation with BUSY error to readable fallback', () => {
    const formatted = formatCameraErrorMessage({
      error: { code: -4, name: 'BUSY', operation: 'unknown_operation' },
      message: 'see data',
    });
    expect(formatted).toBe('操作失败：相机忙，请稍后重试');
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
      '停止录像失败：相机适配异常',
    );
    expect(useCameraStore.getState().landscapeRecordingState).toBe('idle');
    // cameraStatus was NOT falsely set to in_streaming
    expect(useCameraStore.getState().cameraStatus).not.toBe('in_streaming');

    // Checks that camera_state was requested to refresh authoritative state
    const lastSent = socket.sent.map(m => JSON.parse(m)).pop();
    expect(lastSent.instruction).toBe('camera_state');
  });

  it('attaches gain_unit percent and validates integer 0~100 range', () => {
    useCameraStore.getState().connect();
    const socket = MockWebSocket.instances[0];
    socket.open();

    useCameraStore.getState().setGain(50);
    const lastSent = socket.sent.map(m => JSON.parse(m)).pop();
    expect(lastSent).toMatchObject({
      instruction: 'set_gain',
      params: [50],
      gain_unit: 'percent',
    });
  });

  it('rejects illegal gain values such as negative or decimals', () => {
    useCameraStore.getState().connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    const sentCountBefore = socket.sent.length;

    // Negative value
    useCameraStore.getState().setGain(-5 as any);
    expect(socket.sent.length).toBe(sentCountBefore);
    expect(useCameraStore.getState().lastCommandError).toBe(
      'set_gain 增益值必须为 0~100 的整数',
    );

    // Decimal value
    useCameraStore.getState().setGain(25.5 as any);
    expect(socket.sent.length).toBe(sentCountBefore);
    expect(useCameraStore.getState().lastCommandError).toBe(
      'set_gain 增益值必须为 0~100 的整数',
    );
  });

  it('parses target_gain_percent from camera_state and static capabilities', () => {
    useCameraStore.getState().connect();
    const socket = MockWebSocket.instances[0];
    socket.open();

    // Static info capability check
    socket.message({
      device_name: 'main_camera',
      instruction: 'get_static_info',
      data: {
        capabilities: { gain_percent_v1: true },
      },
    });
    expect(useCameraStore.getState().gainPercentSupported).toBe(true);

    // Preview target_gain_percent update
    socket.message({
      device_name: 'main_camera',
      instruction: 'camera_state',
      data: {
        preview: { target_gain_percent: 75 },
      },
    });
    expect(useCameraStore.getState().landscapeManualGain).toBe(75);
  });

  it('links manual exposure and gain when EV is changed and resets EV on manual setting', () => {
    const store = useCameraStore.getState();

    // 1. Establish manual baseline: 0.008s (1/125), gain 10
    store.changeStreamingSetting(0.008, 10);
    expect(useCameraStore.getState().landscapeManualExposure).toBe(0.008);
    expect(useCameraStore.getState().landscapeManualGain).toBe(10);
    expect(useCameraStore.getState().landscapeEv).toBe(0);

    // 2. Change EV to +1.0 -> linked exposure becomes 0.0167s (1/60)
    store.changeEv(1.0);
    expect(useCameraStore.getState().landscapeEv).toBe(1.0);
    expect(useCameraStore.getState().landscapeManualExposure).toBe(0.0167);
    expect(useCameraStore.getState().landscapeManualGain).toBe(10);

    // 3. Change EV to -1.0 -> linked exposure becomes 0.004s (1/250)
    store.changeEv(-1.0);
    expect(useCameraStore.getState().landscapeEv).toBe(-1.0);
    expect(useCameraStore.getState().landscapeManualExposure).toBe(0.004);
    expect(useCameraStore.getState().landscapeManualGain).toBe(10);

    // 4. Return EV to 0 -> restores baseline
    store.changeEv(0);
    expect(useCameraStore.getState().landscapeEv).toBe(0);
    expect(useCameraStore.getState().landscapeManualExposure).toBe(0.008);
    expect(useCameraStore.getState().landscapeManualGain).toBe(10);

    // 5. User adjusts shutter directly -> resets EV to 0 and establishes new baseline
    store.changeEv(1.0);
    expect(useCameraStore.getState().landscapeEv).toBe(1.0);
    store.changeStreamingSetting(0.04, 20);
    expect(useCameraStore.getState().landscapeEv).toBe(0);
    expect(useCameraStore.getState().landscapeManualExposure).toBe(0.04);
    expect(useCameraStore.getState().landscapeManualGain).toBe(20);
  });

  it('maps NO_CARD and storage error codes to friendly messages', () => {
    useCameraStore.getState().connect();
    const socket = MockWebSocket.instances[0];
    socket.open();

    socket.message({
      device_name: 'main_camera',
      instruction: 'capture_stream_frame',
      success: false,
      error: { code: -20, name: 'NO_CARD', operation: 'capture_stream_frame' },
    });
    expect(useCameraStore.getState().lastCommandError).toBe('未检测到 TF 卡');

    socket.message({
      device_name: 'main_camera',
      instruction: 'camera_state',
      data: {
        flags: { storage_ready: false },
      },
    });
    expect(useCameraStore.getState().storageReady).toBe(false);
  });

  it('validates outgoing parameter contracts via normalizeCameraCommand', () => {
    // set_stretch: true -> params [1]; 'on' -> invalid
    const stretchValid = normalizeCameraCommand({
      device_name: 'main_camera',
      instruction: 'set_stretch',
      params: [true],
      id: 'APP-1',
    });
    expect(stretchValid.valid).toBe(true);
    expect(stretchValid.message.params).toEqual([1]);

    const stretchFalse = normalizeCameraCommand({
      device_name: 'main_camera',
      instruction: 'set_stretch',
      params: [false],
      id: 'APP-1b',
    });
    expect(stretchFalse.valid).toBe(true);
    expect(stretchFalse.message.params).toEqual([0]);

    const stretchInvalid = normalizeCameraCommand({
      device_name: 'main_camera',
      instruction: 'set_stretch',
      params: ['on'],
      id: 'APP-2',
    });
    expect(stretchInvalid.valid).toBe(false);

    // set_ev: 99 -> invalid; -3 and 3 -> valid
    const evInvalid = normalizeCameraCommand({
      device_name: 'main_camera',
      instruction: 'set_ev',
      params: [99],
      id: 'APP-3',
    });
    expect(evInvalid.valid).toBe(false);

    const evMin = normalizeCameraCommand({
      device_name: 'main_camera',
      instruction: 'set_ev',
      params: [-3],
      id: 'APP-4',
    });
    expect(evMin.valid).toBe(true);

    const evMax = normalizeCameraCommand({
      device_name: 'main_camera',
      instruction: 'set_ev',
      params: [3],
      id: 'APP-5',
    });
    expect(evMax.valid).toBe(true);

    // set_white_balance: -5 -> invalid; 0 and 5200 -> valid
    const wbInvalid = normalizeCameraCommand({
      device_name: 'main_camera',
      instruction: 'set_white_balance',
      params: [-5],
      id: 'APP-6',
    });
    expect(wbInvalid.valid).toBe(false);

    const wbAuto = normalizeCameraCommand({
      device_name: 'main_camera',
      instruction: 'set_white_balance',
      params: [0],
      id: 'APP-7',
    });
    expect(wbAuto.valid).toBe(true);

    const wbManual = normalizeCameraCommand({
      device_name: 'main_camera',
      instruction: 'set_white_balance',
      params: [5200],
      id: 'APP-8',
    });
    expect(wbManual.valid).toBe(true);

    // change_streaming_frame_rate: [1, 999] -> invalid; [1, 60] -> valid
    const fpsInvalid = normalizeCameraCommand({
      device_name: 'main_camera',
      instruction: 'change_streaming_frame_rate',
      params: [1, 999],
      id: 'APP-9',
    });
    expect(fpsInvalid.valid).toBe(false);

    const fpsValid = normalizeCameraCommand({
      device_name: 'main_camera',
      instruction: 'change_streaming_frame_rate',
      params: [1, 60],
      id: 'APP-10',
    });
    expect(fpsValid.valid).toBe(true);

    // change_streaming_setting: ['fast', 10] -> invalid; [0.008, 10] -> valid
    const settingInvalid = normalizeCameraCommand({
      device_name: 'main_camera',
      instruction: 'change_streaming_setting',
      params: ['fast', 10],
      id: 'APP-11',
    });
    expect(settingInvalid.valid).toBe(false);

    const settingValid = normalizeCameraCommand({
      device_name: 'main_camera',
      instruction: 'change_streaming_setting',
      params: [0.008, 10],
      id: 'APP-12',
    });
    expect(settingValid.valid).toBe(true);

    // switch_auto_mode: 2 -> invalid
    const modeInvalid = normalizeCameraCommand({
      device_name: 'main_camera',
      instruction: 'switch_auto_mode',
      params: [2],
      id: 'APP-13',
    });
    expect(modeInvalid.valid).toBe(false);
  });
});
