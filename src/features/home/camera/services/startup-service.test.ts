import {
  CameraApiError,
  getSerial,
  getVersion,
  postUpdateTime,
  unwrapCamera,
} from '../index';

jest.mock('axios', () => {
  let mockError: unknown;
  let mockResponse: unknown;
  let responseRejected: (error: unknown) => unknown;

  const request = jest.fn().mockImplementation(
    (_config: { method: string; url: string; data?: unknown }) => {
      if (mockError) {
        return Promise.resolve(responseRejected(mockError));
      }
      return Promise.resolve({ data: mockResponse });
    },
  );

  const create = () => ({
    request,
    interceptors: {
      request: {

        use: (_onFulfilled: (config: unknown) => unknown) => {},
      },
      response: {
        // eslint-disable-next-line react/no-unnecessary-use-prefix -- mirrors axios interceptor API
        use: (
          _onFulfilled: (value: unknown) => unknown,
          onRejected: (error: unknown) => unknown,
        ) => {
          responseRejected = onRejected;
        },
      },
    },
  });

  return {
    __esModule: true,
    default: { create },
    create,
    isAxiosError: (value: unknown) =>
      typeof value === 'object'
      && value !== null
      && 'isAxiosError' in value
      && value.isAxiosError === true,
    _setState: (error: unknown, response: unknown) => {
      mockError = error;
      mockResponse = response;
    },
    _reset: () => {
      mockError = undefined;
      mockResponse = undefined;
      request.mockClear();
    },
    _req: request,
  };
});

// The axios mock is scoped to this service contract test.
const axios = require('axios') as {
  _setState: (err: unknown, resp: unknown) => void;
  _reset: () => void;
  _req: jest.Mock;
};

function mockNetworkError(message = 'Network Error') {
  return Object.assign(new Error(message), {
    isAxiosError: true,
    config: { method: 'get', url: '' },
    code: 'ECONNREFUSED',
  });
}

function mockHttpError(status = 500, statusText = 'Internal Server Error') {
  return Object.assign(new Error(statusText), {
    isAxiosError: true,
    response: {
      status,
      statusText,
      headers: {},
      config: {},
      data: null,
    },
    config: {},
  });
}

beforeEach(() => {
  axios._reset();
});

describe('camera/getVersion', () => {
  it('requests the version endpoint and returns version data', async () => {
    axios._setState(undefined, {
      success: true,
      data: { server: 'v1.2.3', hardware: 'hw-001' },
    });

    const result = await getVersion();

    expect(result).toEqual({ server: 'v1.2.3', hardware: 'hw-001' });
    expect(axios._req).toHaveBeenCalledWith({
      method: 'get',
      url: '/StartUp/GetVersion/',
      data: undefined,
    });
  });

  it('throws business CameraApiError when success is false', async () => {
    axios._setState(undefined, {
      success: false,
      data: null,
      message: 'Camera not ready',
    });

    await expect(getVersion()).rejects.toThrow(CameraApiError);
    await expect(getVersion()).rejects.toMatchObject({
      kind: 'business',
      businessMessage: 'Camera not ready',
    });
  });

  it('throws network CameraApiError on network failure', async () => {
    axios._setState(mockNetworkError('Connection refused'), undefined);

    await expect(getVersion()).rejects.toThrow(CameraApiError);
    await expect(getVersion()).rejects.toMatchObject({ kind: 'network' });
  });

  it('throws http CameraApiError on non-2xx response', async () => {
    axios._setState(mockHttpError(503, 'Service Unavailable'), undefined);

    await expect(getVersion()).rejects.toThrow(CameraApiError);
    await expect(getVersion()).rejects.toMatchObject({
      kind: 'http',
      status: 503,
    });
  });
});

describe('camera/getSerial', () => {
  it('requests the serial endpoint and returns serial data', async () => {
    axios._setState(undefined, {
      success: true,
      data: { SN: 'SN-123456', magic: '0xdead', hardware: 'rev-b', HD: '128GB' },
    });

    const result = await getSerial();

    expect(result).toEqual({
      SN: 'SN-123456',
      magic: '0xdead',
      hardware: 'rev-b',
      HD: '128GB',
    });
    expect(axios._req).toHaveBeenCalledWith({
      method: 'get',
      url: '/StartUp/Serial/',
      data: undefined,
    });
  });

  it('throws business CameraApiError on success false', async () => {
    axios._setState(undefined, {
      success: false,
      data: null,
      message: 'Serial unavailable',
    });

    await expect(getSerial()).rejects.toThrow(CameraApiError);
    await expect(getSerial()).rejects.toMatchObject({ kind: 'business' });
  });

  it('throws network CameraApiError on ETIMEDOUT', async () => {
    axios._setState(mockNetworkError('ETIMEDOUT'), undefined);

    await expect(getSerial()).rejects.toMatchObject({ kind: 'network' });
  });

  it('throws http CameraApiError on HTTP 404', async () => {
    axios._setState(mockHttpError(404, 'Not Found'), undefined);

    await expect(getSerial()).rejects.toMatchObject({
      kind: 'http',
      status: 404,
    });
  });
});

describe('camera/postUpdateTime', () => {
  it('sends snake_case payload and resolves on success', async () => {
    axios._setState(undefined, { success: true, data: null });

    await expect(
      postUpdateTime({ time: '2025-01-01 00:00:00', time_zone: 8 }),
    ).resolves.toBeUndefined();

    expect(axios._req).toHaveBeenCalledWith({
      method: 'post',
      url: '/StartUp/UpdateTime/',
      data: { time: '2025-01-01 00:00:00', time_zone: 8 },
    });
  });

  it('throws business CameraApiError on time sync failure', async () => {
    axios._setState(undefined, {
      success: false,
      data: null,
      message: 'Time sync not permitted',
    });

    await expect(
      postUpdateTime({ time: '2025-01-01 00:00:00', time_zone: 0 }),
    ).rejects.toMatchObject({
      kind: 'business',
      businessMessage: 'Time sync not permitted',
    });
  });

  it('throws network CameraApiError on ENOTFOUND', async () => {
    axios._setState(mockNetworkError('ENOTFOUND'), undefined);

    await expect(
      postUpdateTime({ time: '2025-01-01 00:00:00', time_zone: 0 }),
    ).rejects.toMatchObject({ kind: 'network' });
  });

  it('throws http CameraApiError on HTTP 500', async () => {
    axios._setState(mockHttpError(500, 'Internal Server Error'), undefined);

    await expect(
      postUpdateTime({ time: '2025-01-01 00:00:00', time_zone: 0 }),
    ).rejects.toMatchObject({ kind: 'http', status: 500 });
  });
});

describe('camera/CameraApiError', () => {
  it('fromBusiness carries businessMessage and payload as cause', () => {
    const payload = { success: false, data: null, message: 'Timeout' };
    const err = CameraApiError.fromBusiness(payload, 'get', '/StartUp/GetVersion/');
    expect(err.kind).toBe('business');
    expect(err.businessMessage).toBe('Timeout');
    expect(err.message).toContain('Timeout');
    expect(err.message).toContain('/StartUp/GetVersion/');
    expect(err.cause).toBe(payload);
  });

  it('fromBusiness returns instanceof Error', () => {
    const payload = { success: false, data: null, message: 'Locked' };
    const err = CameraApiError.fromBusiness(payload, 'post', '/StartUp/UpdateTime/');
    expect(err).toBeInstanceOf(CameraApiError);
    expect(err).toBeInstanceOf(Error);
  });

  it('normalizes a missing response payload as a business error', () => {
    expect(() => unwrapCamera(null as never, 'get', '/StartUp/GetVersion/'))
      .toThrow(CameraApiError);
  });

  it('status is set on HTTP errors', () => {
    const error = mockHttpError(403, 'Forbidden');
    const err = CameraApiError.fromAxios(error);
    expect(err.kind).toBe('http');
    expect(err.status).toBe(403);
  });

  it('network errors have no status', () => {
    const error = mockNetworkError('ECONNRESET');
    const err = CameraApiError.fromAxios(error);
    expect(err.kind).toBe('network');
    expect(err.status).toBeUndefined();
  });
});
