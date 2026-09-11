import {
  downloadFirmwarePackage,
  getFirmwareUpdate,
  getOtaAppDeviceCode,
  getOtaInfo,
  isNewerFirmware,
} from './ota-service';

const mockPost = jest.fn();
const mockDownload = jest.fn();
const mockMove = jest.fn();
const mockDelete = jest.fn();
const mockGetInfo = jest.fn();
const mockMakeDirectory = jest.fn();
const mockStored = new Map<string, string>();
const mockCreateDownload = jest.fn((..._args: unknown[]) => ({
  downloadAsync: mockDownload,
}));

jest.mock('axios', () => ({
  create: () => ({
    post: (...args: unknown[]) => mockPost(...args),
    interceptors: { response: { use: jest.fn() }, request: { use: jest.fn() } },
  }),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'installation-uuid' }));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  createDownloadResumable: (...args: unknown[]) => mockCreateDownload(...args),
  moveAsync: (...args: unknown[]) => mockMove(...args),
  deleteAsync: (...args: unknown[]) => mockDelete(...args),
  getInfoAsync: (...args: unknown[]) => mockGetInfo(...args),
  makeDirectoryAsync: (...args: unknown[]) => mockMakeDirectory(...args),
}));
jest.mock('@/lib/storage', () => ({
  storage: {
    getString: (key: string) => mockStored.get(key),
    set: (key: string, value: string) => mockStored.set(key, value),
  },
}));
jest.mock('../../home/camera/client', () => ({
  cameraClient: { post: jest.fn() },
}));
jest.mock('../../home/camera/config', () => ({
  getCameraBaseUrl: () => 'http://camera',
}));

const firmware = { version: '1.1.8', file_name: 'camera-1.1.8.tar' };
const device = { hardware: 'camera-pro', SN: 'SN123' };

beforeEach(() => {
  jest.clearAllMocks();
  mockStored.clear();
  mockPost.mockReset().mockResolvedValue({ success: true, data: firmware });
  mockDownload.mockReset().mockResolvedValue({ status: 200 });
  mockGetInfo
    .mockReset()
    .mockResolvedValue({ exists: true, isDirectory: false, size: 1024 });
  mockMove.mockResolvedValue(undefined);
  mockDelete.mockResolvedValue(undefined);
});

it.each([
  ['V1.10.0', 'v1.9.9', true],
  ['1.0.0', '1.0', false],
  ['1.1.8', '1.1.8', false],
  ['1.0.8', '1.1.8', false],
  ['2.0.0', '1.99.99', true],
])('compares firmware %s against %s', (latest, current, expected) => {
  expect(isNewerFirmware(latest, current)).toBe(expected);
});

it('reads the API body already unwrapped by the axios interceptor', async () => {
  await expect(getOtaInfo('camera-pro')).resolves.toEqual(firmware);
  expect(mockPost).toHaveBeenCalledWith(
    '/OTA/api/get-ota-info/',
    { model_name: 'camera-pro' },
    { timeout: 15000 },
  );
});

it('does not offer the same version or a downgrade', async () => {
  await expect(getFirmwareUpdate('camera-pro', '1.1.8')).resolves.toBeNull();
  await expect(getFirmwareUpdate('camera-pro', '1.2.0')).resolves.toBeNull();
  await expect(getFirmwareUpdate('camera-pro', '1.0.8')).resolves.toEqual(
    firmware,
  );
});

it('distinguishes no update from server failure and rejects invalid packages', async () => {
  mockPost.mockResolvedValueOnce({ success: true, data: null });
  await expect(getOtaInfo('camera-pro')).resolves.toBeNull();
  mockPost.mockResolvedValueOnce({ success: false });
  await expect(getOtaInfo('camera-pro')).rejects.toThrow();
  mockPost.mockResolvedValueOnce({
    success: true,
    data: { ...firmware, file_name: '../firmware.tar' },
  });
  await expect(getOtaInfo('camera-pro')).rejects.toThrow();
  expect(() => isNewerFirmware('unknown', '1.0')).toThrow();
});

it('persists a real installation identifier instead of sending a shared placeholder', () => {
  expect(getOtaAppDeviceCode()).toBe('installation-uuid');
  mockStored.set('OTA_APP_DEVICE_CODE', 'existing-installation');
  expect(getOtaAppDeviceCode()).toBe('existing-installation');
});

it('saves a downloaded firmware file before recording success', async () => {
  const progress = jest.fn();
  const uri = await downloadFirmwarePackage(firmware, device, progress);
  expect(uri).toBe('file:///documents/firmware/SN123/camera-1.1.8.tar');
  expect(mockMove).toHaveBeenCalledWith({ from: `${uri}.part`, to: uri });
  expect(JSON.parse(mockStored.get('OTA_DOWNLOADED_PACKAGE')!)).toEqual({
    ...firmware,
    uri,
    serialNumber: device.SN,
  });
  expect(mockPost).toHaveBeenCalledWith('/OTA/api/update-app-device-code/', {
    model_name: device.hardware,
    serial_number: device.SN,
    app_device_code: 'installation-uuid',
  });
});

it.each([500, 403])(
  'does not mark HTTP %s as a successful download',
  async (status) => {
    mockDownload.mockResolvedValue({ status });
    await expect(
      downloadFirmwarePackage(firmware, device, jest.fn()),
    ).rejects.toThrow('Download failed');
    expect(mockMove).not.toHaveBeenCalled();
    expect(mockStored.has('OTA_DOWNLOADED_PACKAGE')).toBe(false);
    expect(mockDelete).toHaveBeenCalledWith(expect.stringContaining('.part'), {
      idempotent: true,
    });
  },
);

it('rejects empty downloads and denied device registration', async () => {
  mockGetInfo.mockResolvedValue({ exists: true, isDirectory: false, size: 0 });
  await expect(
    downloadFirmwarePackage(firmware, device, jest.fn()),
  ).rejects.toThrow('empty');
  mockCreateDownload.mockClear();
  mockPost.mockResolvedValue({ success: false });
  await expect(
    downloadFirmwarePackage(firmware, device, jest.fn()),
  ).rejects.toThrow();
  expect(mockCreateDownload).not.toHaveBeenCalled();
  expect(mockStored.has('OTA_DOWNLOADED_PACKAGE')).toBe(false);
});
