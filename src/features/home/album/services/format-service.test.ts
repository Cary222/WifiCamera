import { cameraClient } from '../../camera/client';
import {
  FormatError,
  formatSdCard,
} from './format-service';

jest.mock('../../camera/client', () => ({
  cameraClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('format-service: unsupported old firmware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects with FORMAT_ENDPOINT_NOT_AVAILABLE and sends NO POST when /storage/status 404s', async () => {
    (cameraClient.get as jest.Mock).mockRejectedValueOnce(
      new Error('Request failed with status code 404'),
    );

    await expect(formatSdCard()).rejects.toThrow('FORMAT_ENDPOINT_NOT_AVAILABLE');

    // Crucial requirement: No destructive POST must ever be sent to legacy firmware
    expect(cameraClient.post).not.toHaveBeenCalled();
    expect(cameraClient.get).toHaveBeenCalledWith(
      expect.stringContaining('/storage/status'),
      expect.anything(),
    );
  });

  it('rejects with FORMAT_UNSUPPORTED_FIRMWARE and sends NO POST when format_supported is false', async () => {
    (cameraClient.get as jest.Mock).mockResolvedValueOnce({
      data: {
        ok: true,
        storage: {
          format_supported: false,
          has_card: true,
          card_mounted: true,
        },
      },
    });

    const errPromise = formatSdCard();
    await expect(errPromise).rejects.toThrow(FormatError);
    await expect(errPromise).rejects.toThrow('固件暂未提供格式化接口，操作未执行。');

    expect(cameraClient.post).not.toHaveBeenCalled();
  });
});

describe('format-service: single confirmation POST', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('performs pre-flight GET then exactly one POST with confirm=true and request_id', async () => {
    (cameraClient.get as jest.Mock).mockResolvedValueOnce({
      data: {
        ok: true,
        storage: {
          format_supported: true,
          has_card: true,
          card_mounted: true,
          busy: false,
        },
      },
    });

    (cameraClient.post as jest.Mock).mockResolvedValueOnce({
      data: {
        ok: true,
        status: 'success',
        message: 'Format complete',
      },
    });

    const result = await formatSdCard({ requestId: 'custom_req_001' });

    expect(result).toEqual({
      ok: true,
      status: 'success',
      requestId: 'custom_req_001',
      taskId: undefined,
      message: 'Format complete',
    });

    expect(cameraClient.post).toHaveBeenCalledTimes(1);
    expect(cameraClient.post).toHaveBeenCalledWith(
      expect.stringContaining('/storage/format'),
      {
        confirm: true,
        request_id: 'custom_req_001',
        card_token: 'token_auto',
      },
      expect.objectContaining({ timeout: 10_000 }),
    );
  });
});

describe('format-service: busy prevents duplicate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects during pre-flight check with STORAGE_BUSY when board is busy and sends NO POST', async () => {
    (cameraClient.get as jest.Mock).mockResolvedValueOnce({
      data: {
        ok: true,
        storage: {
          format_supported: true,
          has_card: true,
          card_mounted: true,
          busy: true,
          busy_reason: 'Recording video to TF card',
        },
      },
    });

    await expect(formatSdCard()).rejects.toMatchObject({
      code: 'STORAGE_BUSY',
      message: 'Recording video to TF card',
    });

    expect(cameraClient.post).not.toHaveBeenCalled();
  });

  it('handles BUSY error from POST without retrying', async () => {
    (cameraClient.get as jest.Mock).mockResolvedValueOnce({
      data: {
        ok: true,
        storage: {
          format_supported: true,
          has_card: true,
          card_mounted: true,
          busy: false,
        },
      },
    });

    (cameraClient.post as jest.Mock).mockResolvedValueOnce({
      data: {
        ok: false,
        error_code: 'BUSY',
        message: 'Storage device is locked by capture task',
      },
    });

    await expect(formatSdCard()).rejects.toMatchObject({
      code: 'STORAGE_BUSY',
      message: 'Storage device is locked by capture task',
    });

    expect(cameraClient.post).toHaveBeenCalledTimes(1);
  });
});

describe('format-service: no card / read-only checks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects with STORAGE_NO_CARD when TF card is missing or unmounted', async () => {
    (cameraClient.get as jest.Mock).mockResolvedValueOnce({
      data: {
        ok: true,
        storage: {
          format_supported: true,
          has_card: false,
          card_mounted: false,
        },
      },
    });

    await expect(formatSdCard()).rejects.toMatchObject({
      code: 'STORAGE_NO_CARD',
    });

    expect(cameraClient.post).not.toHaveBeenCalled();
  });

  it('rejects with STORAGE_READ_ONLY when TF card is read-only', async () => {
    (cameraClient.get as jest.Mock).mockResolvedValueOnce({
      data: {
        ok: true,
        storage: {
          format_supported: true,
          has_card: true,
          card_mounted: true,
          read_only: true,
        },
      },
    });

    await expect(formatSdCard()).rejects.toMatchObject({
      code: 'STORAGE_READ_ONLY',
    });

    expect(cameraClient.post).not.toHaveBeenCalled();
  });
});

describe('format-service: errors and timeouts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports FORMAT_STATUS_UNKNOWN when POST times out and reconciliation query is inconclusive', async () => {
    (cameraClient.get as jest.Mock)
      .mockResolvedValueOnce({
        data: {
          ok: true,
          storage: {
            format_supported: true,
            has_card: true,
            card_mounted: true,
            busy: false,
          },
        },
      })
      .mockRejectedValueOnce(new Error('Network timeout during status check'));

    (cameraClient.post as jest.Mock).mockRejectedValueOnce(
      new Error('Network timeout on POST /storage/format'),
    );

    const errPromise = formatSdCard({ requestId: 'req_timeout_123' });
    await expect(errPromise).rejects.toMatchObject({
      code: 'FORMAT_STATUS_UNKNOWN',
      requestId: 'req_timeout_123',
    });

    expect(cameraClient.post).toHaveBeenCalledTimes(1);
  });

  it('succeeds if reconciliation status query confirms board actually finished format after POST network error', async () => {
    (cameraClient.get as jest.Mock)
      .mockResolvedValueOnce({
        data: {
          ok: true,
          storage: {
            format_supported: true,
            has_card: true,
            card_mounted: true,
            busy: false,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          status: 'success',
          task_id: 'task_reconciled_999',
          message: 'Board formatted successfully despite response dropout',
        },
      });

    (cameraClient.post as jest.Mock).mockRejectedValueOnce(
      new Error('Socket hang up after format execution'),
    );

    const res = await formatSdCard({ requestId: 'req_reconcile_456' });
    expect(res.ok).toBe(true);
    expect(res.status).toBe('success');
    expect(res.taskId).toBe('task_reconciled_999');

    expect(cameraClient.post).toHaveBeenCalledTimes(1);
  });

  it('rejects with FORMAT_FAILED when POST explicitly returns failure', async () => {
    (cameraClient.get as jest.Mock).mockResolvedValueOnce({
      data: {
        ok: true,
        storage: {
          format_supported: true,
          has_card: true,
          card_mounted: true,
          busy: false,
        },
      },
    });

    (cameraClient.post as jest.Mock).mockResolvedValueOnce({
      data: {
        ok: false,
        error_code: 'MKFS_FAILED',
        message: 'Failed to create filesystem on /dev/mmcblk0p1',
      },
    });

    await expect(formatSdCard()).rejects.toMatchObject({
      code: 'FORMAT_FAILED',
      message: 'Failed to create filesystem on /dev/mmcblk0p1',
    });

    expect(cameraClient.post).toHaveBeenCalledTimes(1);
  });
});

describe('format-service: bounded polling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('polls GET /storage/format/status until success without sending repeated POST', async () => {
    (cameraClient.get as jest.Mock)
      .mockResolvedValueOnce({
        data: {
          ok: true,
          storage: {
            format_supported: true,
            has_card: true,
            card_mounted: true,
            busy: false,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          status: 'running',
          task_id: 'task_async_01',
          progress: 30,
        },
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          status: 'success',
          task_id: 'task_async_01',
          message: 'Async format completed',
        },
      });

    (cameraClient.post as jest.Mock).mockResolvedValueOnce({
      data: {
        ok: true,
        status: 'running',
        task_id: 'task_async_01',
      },
    });

    const onProgress = jest.fn();
    const res = await formatSdCard({
      pollIntervalMs: 1,
      maxPollAttempts: 5,
      onProgress,
    });

    expect(res).toEqual({
      ok: true,
      status: 'success',
      requestId: expect.any(String),
      taskId: 'task_async_01',
      message: 'Async format completed',
    });

    expect(onProgress).toHaveBeenCalledWith(30);

    // Crucial: exactly one POST, never repeated during polling
    expect(cameraClient.post).toHaveBeenCalledTimes(1);
    // Pre-flight GET + 2 status polls
    expect(cameraClient.get).toHaveBeenCalledTimes(3);
  });

  it('stops at maxPollAttempts and throws FORMAT_STATUS_UNKNOWN without repeating POST', async () => {
    (cameraClient.get as jest.Mock)
      .mockResolvedValueOnce({
        data: {
          ok: true,
          storage: {
            format_supported: true,
            has_card: true,
            card_mounted: true,
            busy: false,
          },
        },
      })
      .mockResolvedValue({
        data: {
          ok: true,
          status: 'running',
          task_id: 'task_slow_01',
          progress: 50,
        },
      });

    (cameraClient.post as jest.Mock).mockResolvedValueOnce({
      data: {
        ok: true,
        status: 'running',
        task_id: 'task_slow_01',
      },
    });

    const errPromise = formatSdCard({
      pollIntervalMs: 1,
      maxPollAttempts: 3,
    });

    await expect(errPromise).rejects.toMatchObject({
      code: 'FORMAT_STATUS_UNKNOWN',
      taskId: 'task_slow_01',
    });

    expect(cameraClient.post).toHaveBeenCalledTimes(1);
    expect(cameraClient.get).toHaveBeenCalledTimes(4);
  });
});
