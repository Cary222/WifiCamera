/**
 * Format service — TF card format interface and draft firmware contract.
 *
 * NOTE: The endpoints in PROPOSED_STORAGE_ENDPOINTS (/storage/status,
 * /storage/format, /storage/format/status) represent the PROPOSED DRAFT CONTRACT.
 * Board firmware (rechecked at commit c6fb93c 2026-09-20) has NOT yet implemented them.
 *
 * Safety design:
 * 1. Safe read-only pre-flight check (GET /storage/status) rejects legacy firmware
 *    before any destructive execution can take place (NO POST sent to legacy firmware).
 * 2. Strictly single POST /storage/format with explicit confirmation and request_id.
 * 3. Never auto-retries POST on timeout/failure; retains request_id/task_id to reconcile.
 * 4. Bounded polling on GET /storage/format/status for asynchronous format operations.
 * 5. Timeouts and network dropouts report honest unknown status without false success/failure.
 */
import { cameraClient } from '../../camera/client';
import {
  FORMAT_CHECK_TIMEOUT_MS,
  FORMAT_MAX_POLL_ATTEMPTS,
  FORMAT_POLL_INTERVAL_MS,
  FORMAT_POST_TIMEOUT_MS,
  getAlbumBaseUrl,
  PROPOSED_STORAGE_ENDPOINTS,
} from '../config';

/**
 * PROPOSED DRAFT CONTRACT: Storage capability and status schema.
 */
export type StorageStatusResponse = {
  ok?: boolean;
  format_supported?: boolean;
  filesystem?: string;
  max_volume_bytes?: number;
  card_token?: string;
  capacity_bytes?: number;
  mounted?: boolean;
  read_only?: boolean;
  supported_layout?: string;
  busy?: boolean;
  error?: string;
  // Compatibility fallback fields
  success?: boolean;
  storage?: {
    has_card?: boolean;
    card_mounted?: boolean;
    mount_point?: string | null;
    read_only?: boolean;
    busy?: boolean;
    busy_reason?: string | null;
    format_supported?: boolean;
  };
  error_code?: string;
  message?: string;
};

/**
 * PROPOSED DRAFT CONTRACT: POST /storage/format request body.
 */
export type FormatRequestPayload = {
  request_id: string;
  card_token: string;
  confirm: true;
};

/**
 * Firmware contract: POST /storage/format and GET /storage/format/status response schema.
 */
export type FormatResponse = {
  ok: boolean;
  request_id?: string;
  state?: 'running' | 'succeeded' | 'failed' | 'interrupted';
  phase?: 'checking' | 'quiescing' | 'unmounting' | 'formatting' | 'mounting' | 'verifying';
  error?: string;
  filesystem?: string;
  data_may_be_lost?: boolean;
  // Compatibility fallback fields
  status?: 'running' | 'success' | 'failed';
  task_id?: string;
  success?: boolean;
  message?: string;
  error_code?: string;
  progress?: number;
};

export type FormatTaskStatusResponse = FormatResponse;

export type FormatErrorCode
  = | 'FORMAT_UNSUPPORTED_FIRMWARE'
    | 'FORMAT_ENDPOINT_NOT_AVAILABLE'
    | 'STORAGE_BUSY'
    | 'STORAGE_NO_CARD'
    | 'STORAGE_READ_ONLY'
    | 'FORMAT_FAILED'
    | 'FORMAT_STATUS_UNKNOWN'
    | 'FORMAT_CANCELLED';

export class FormatError extends Error {
  readonly code: FormatErrorCode;
  readonly requestId?: string;
  readonly taskId?: string;
  readonly cause?: unknown;

  constructor(
    code: FormatErrorCode,
    message: string,
    options?: { requestId?: string; taskId?: string; cause?: unknown },
  ) {
    super(message);
    this.name = 'FormatError';
    this.code = code;
    this.requestId = options?.requestId;
    this.taskId = options?.taskId;
    this.cause = options?.cause;
  }
}

export type FormatSdCardOptions = {
  requestId?: string;
  maxPollAttempts?: number;
  pollIntervalMs?: number;
  onProgress?: (progress: number) => void;
};

export type FormatResult = {
  ok: boolean;
  status: 'success' | 'running' | 'failed';
  requestId: string;
  taskId?: string;
  message?: string;
};

function generateRequestId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 9);
  return `fmt_${ts}_${rand}`;
}

/**
 * Pre-flight capability and health check before destructive format.
 *
 * Queries GET /storage/status. If the endpoint does not exist (404/legacy firmware),
 * it throws FORMAT_ENDPOINT_NOT_AVAILABLE immediately, ensuring NO destructive POST
 * request is ever dispatched to legacy or incompatible boards.
 */
export type StorageCapabilities = {
  format_supported: boolean;
  card_token?: string;
  capacity_bytes?: number;
  mounted: boolean;
  read_only: boolean;
  busy: boolean;
  busy_reason?: string | null;
};

export async function checkStorageCapabilities(
  baseUrl: string,
): Promise<StorageCapabilities> {
  const statusUrl = `${baseUrl}${PROPOSED_STORAGE_ENDPOINTS.status}`;
  let res;
  try {
    res = await cameraClient.get<StorageStatusResponse>(statusUrl, {
      timeout: FORMAT_CHECK_TIMEOUT_MS,
    });
  }
  catch (error) {
    // Legacy firmware returns 404, 405, or connection error on /storage/status
    throw new FormatError(
      'FORMAT_ENDPOINT_NOT_AVAILABLE',
      'FORMAT_ENDPOINT_NOT_AVAILABLE',
      { cause: error },
    );
  }

  const payload = res?.data;
  if (!payload) {
    throw new FormatError(
      'FORMAT_ENDPOINT_NOT_AVAILABLE',
      'FORMAT_ENDPOINT_NOT_AVAILABLE',
    );
  }

  // Flatten both standard firmware response and fallback/mock format
  const formatSupported = payload.format_supported ?? payload.storage?.format_supported;
  const mounted = payload.mounted ?? payload.storage?.card_mounted ?? payload.storage?.has_card;
  const readOnly = payload.read_only ?? payload.storage?.read_only;
  const busy = payload.busy ?? payload.storage?.busy;
  const cardToken = payload.card_token;
  const errorField = payload.error ?? payload.error_code;
  if (payload.ok === false) {
    if (errorField === 'NO_CARD' || errorField === 'STORAGE_NO_CARD') {
      throw new FormatError('STORAGE_NO_CARD', '未检测到TF卡或TF卡未挂载，无法格式化。', { cause: payload });
    }
    if (errorField === 'BUSY' || errorField === 'STORAGE_BUSY') {
      throw new FormatError('STORAGE_BUSY', payload.storage?.busy_reason || '相机当前正忙或正在写入，无法执行格式化。', { cause: payload });
    }
    if (errorField === 'READ_ONLY' || errorField === 'STORAGE_READ_ONLY') {
      throw new FormatError('STORAGE_READ_ONLY', 'TF卡为只读状态，无法格式化。', { cause: payload });
    }
    if (errorField === 'UNSUPPORTED' || errorField === 'NOT_AVAILABLE' || formatSupported === false) {
      throw new FormatError('FORMAT_UNSUPPORTED_FIRMWARE', '固件暂未提供格式化接口，操作未执行。', { cause: payload });
    }
    throw new FormatError('FORMAT_FAILED', payload.message || errorField || '存储状态查询失败', { cause: payload });
  }
  if (mounted === false || errorField === 'NO_CARD') {
    throw new FormatError('STORAGE_NO_CARD', '未检测到TF卡或TF卡未挂载，无法格式化。', { cause: payload });
  }

  if (formatSupported === false) {
    throw new FormatError('FORMAT_UNSUPPORTED_FIRMWARE', '固件暂未提供格式化接口，操作未执行。', { cause: payload });
  }
  if (busy === true) {
    throw new FormatError('STORAGE_BUSY', payload.storage?.busy_reason || '相机当前正忙或正在写入，无法执行格式化。', { cause: payload });
  }
  if (readOnly === true) {
    throw new FormatError('STORAGE_READ_ONLY', 'TF卡为只读状态，无法格式化。', { cause: payload });
  }

  return {
    format_supported: formatSupported ?? true,
    card_token: cardToken,
    capacity_bytes: payload.capacity_bytes,
    mounted: mounted ?? true,
    read_only: readOnly ?? false,
    busy: busy ?? false,
    busy_reason: payload.storage?.busy_reason,
  };
}

/**
 * Read-only status query for an ongoing or completed format task.
 */
export async function getFormatTaskStatus(
  baseUrl: string,
  query: { taskId?: string; requestId?: string },
): Promise<FormatTaskStatusResponse> {
  const url = `${baseUrl}${PROPOSED_STORAGE_ENDPOINTS.formatStatus}`;
  const res = await cameraClient.get<FormatTaskStatusResponse>(url, {
    params: {
      ...(query.taskId ? { task_id: query.taskId } : {}),
      ...(query.requestId ? { request_id: query.requestId } : {}),
    },
    timeout: FORMAT_CHECK_TIMEOUT_MS,
    validateStatus: status => status < 500,
  });
  return res.data;
}

async function reconcilePostFailure(
  baseUrl: string,
  requestId: string,
  postError: unknown,
): Promise<FormatResponse> {
  if (postError && typeof postError === 'object' && 'response' in postError) {
    const respData = (postError as { response?: { data?: FormatResponse } }).response?.data;
    if (respData && typeof respData === 'object' && ('ok' in respData || 'error' in respData)) {
      return respData;
    }
  }

  try {
    const statusCheck = await getFormatTaskStatus(baseUrl, { requestId });
    if (!statusCheck || statusCheck.ok === false || statusCheck.error === 'NOT_FOUND') {
      throw new FormatError(
        'FORMAT_FAILED',
        statusCheck?.error || statusCheck?.message || 'TF卡格式化未受理或任务不存在',
        { requestId, cause: statusCheck },
      );
    }
    const state = statusCheck.state ?? statusCheck.status;
    if (state === 'succeeded' || state === 'success') {
      return {
        ok: true,
        state: 'succeeded',
        status: 'success',
        request_id: requestId,
        task_id: statusCheck.task_id ?? requestId,
        message: statusCheck.message,
      };
    }
    if (state === 'running') {
      return {
        ok: true,
        state: 'running',
        status: 'running',
        request_id: requestId,
        task_id: statusCheck.task_id ?? requestId,
        phase: statusCheck.phase,
      };
    }
    if (state === 'failed' || state === 'interrupted') {
      throw new FormatError(
        'FORMAT_FAILED',
        statusCheck.error || statusCheck.message || 'TF卡格式化失败',
        { requestId, taskId: statusCheck.task_id, cause: statusCheck },
      );
    }
    throw new FormatError(
      'FORMAT_STATUS_UNKNOWN',
      '格式化状态未知（请求已发出但响应超时或连接中断），请确认相机连接并刷新相册，切勿连续重复格式化。',
      { requestId, cause: postError },
    );
  }
  catch (statusError) {
    if (statusError instanceof FormatError) {
      throw statusError;
    }
    throw new FormatError(
      'FORMAT_STATUS_UNKNOWN',
      '格式化状态未知（请求已发出但响应超时或连接中断），请确认相机连接并刷新相册，切勿连续重复格式化。',
      { requestId, cause: postError },
    );
  }
}

async function executeSingleFormatPost(
  baseUrl: string,
  requestId: string,
  cardToken?: string,
): Promise<FormatResponse> {
  const formatUrl = `${baseUrl}${PROPOSED_STORAGE_ENDPOINTS.format}`;
  try {
    const payload: FormatRequestPayload = {
      request_id: requestId,
      card_token: cardToken ?? 'token_auto',
      confirm: true,
    };
    const res = await cameraClient.post<FormatResponse>(
      formatUrl,
      payload,
      {
        timeout: FORMAT_POST_TIMEOUT_MS,
        validateStatus: status => status < 500,
      },
    );
    return res.data;
  }
  catch (postError) {
    return reconcilePostFailure(baseUrl, requestId, postError);
  }
}

function handleFormatPostErrors(formatRes: FormatResponse, requestId: string): void {
  const err = (formatRes.error ?? formatRes.error_code ?? '').toUpperCase();
  if (formatRes.ok === false || formatRes.state === 'failed' || formatRes.state === 'interrupted') {
    if (err === 'BUSY' || err === 'STORAGE_BUSY') {
      throw new FormatError(
        'STORAGE_BUSY',
        formatRes.message || '相机当前正忙或正在写入，无法执行格式化。',
        { requestId, taskId: formatRes.task_id ?? requestId },
      );
    }
    if (err === 'NO_CARD' || err === 'CARD_CHANGED' || err === 'STORAGE_NO_CARD') {
      throw new FormatError(
        'STORAGE_NO_CARD',
        formatRes.message || '未检测到TF卡或TF卡已变化，无法格式化。',
        { requestId, taskId: formatRes.task_id ?? requestId },
      );
    }
    if (err === 'READ_ONLY' || err === 'STORAGE_READ_ONLY') {
      throw new FormatError(
        'STORAGE_READ_ONLY',
        formatRes.message || 'TF卡为只读状态，无法格式化。',
        { requestId, taskId: formatRes.task_id ?? requestId },
      );
    }
    if (err === 'UNSUPPORTED_LAYOUT' || err === 'UNSUPPORTED_CAPACITY' || err === 'INVALID_TARGET') {
      throw new FormatError(
        'FORMAT_FAILED',
        '此卡布局或容量不支持，无法执行格式化。',
        { requestId, taskId: formatRes.task_id ?? requestId },
      );
    }
    if (err === 'UNMOUNT_FAILED') {
      throw new FormatError(
        'STORAGE_BUSY',
        'TF卡仍被系统占用，未继续执行格式化。',
        { requestId, taskId: formatRes.task_id ?? requestId },
      );
    }
    throw new FormatError(
      'FORMAT_FAILED',
      formatRes.message || formatRes.error || 'TF卡格式化失败',
      { requestId, taskId: formatRes.task_id ?? requestId },
    );
  }
}

async function pollRunningFormatTask(
  baseUrl: string,
  taskInfo: { taskId: string; requestId: string },
  options?: FormatSdCardOptions,
): Promise<FormatResult> {
  const { taskId, requestId } = taskInfo;
  const maxAttempts = options?.maxPollAttempts ?? FORMAT_MAX_POLL_ATTEMPTS;
  const intervalMs = options?.pollIntervalMs ?? FORMAT_POLL_INTERVAL_MS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (intervalMs > 0) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    let pollRes: FormatTaskStatusResponse;
    try {
      pollRes = await getFormatTaskStatus(baseUrl, { taskId, requestId });
    }
    catch {
      if (attempt < maxAttempts) {
        continue;
      }
      throw new FormatError(
        'FORMAT_STATUS_UNKNOWN',
        '格式化状态查询超时或连接中断，当前状态未知。请确认相机连接后刷新相册，切勿重复格式化。',
        { requestId, taskId },
      );
    }

    const pollState = pollRes.state ?? pollRes.status;
    if (pollState === 'succeeded' || pollState === 'success') {
      return {
        ok: true,
        status: 'success',
        requestId,
        taskId,
        message: pollRes.message,
      };
    }

    if (pollState === 'failed' || pollState === 'interrupted') {
      throw new FormatError(
        'FORMAT_FAILED',
        pollRes.error || pollRes.message || 'TF卡格式化失败',
        { requestId, taskId, cause: pollRes },
      );
    }

    if (pollState === 'running') {
      // Progress can be phase-based in firmware contract
      options?.onProgress?.(pollRes.progress ?? 0);
    }
  }

  throw new FormatError(
    'FORMAT_STATUS_UNKNOWN',
    '格式化耗时较长，当前仍在处理中或状态未知。请稍后刷新相册确认，切勿重复格式化。',
    { requestId, taskId },
  );
}

/**
 * Execute TF card format with safety guards:
 * 1. Safe read-only pre-flight check (GET /storage/status).
 * 2. Strictly single POST /storage/format with idempotency request_id.
 * 3. Bounded polling if board returns an asynchronous task.
 * 4. Never auto-retries mutation on network timeout; reports honest unknown state.
 */
export async function formatSdCard(
  options?: FormatSdCardOptions,
): Promise<FormatResult> {
  const baseUrl = getAlbumBaseUrl();
  const requestId = options?.requestId || generateRequestId();

  const caps = await checkStorageCapabilities(baseUrl);
  const formatRes = await executeSingleFormatPost(baseUrl, requestId, caps.card_token);

  handleFormatPostErrors(formatRes, requestId);

  const resState = formatRes.state ?? formatRes.status;
  if (resState === 'succeeded' || resState === 'success') {
    return {
      ok: true,
      status: 'success',
      requestId,
      taskId: formatRes.task_id,
      message: formatRes.message,
    };
  }

  const taskId = formatRes.task_id ?? formatRes.request_id ?? requestId;
  if (resState === 'running') {
    return pollRunningFormatTask(baseUrl, { taskId, requestId }, options);
  }

  if (formatRes.ok) {
    return {
      ok: true,
      status: 'success',
      requestId,
      taskId,
      message: formatRes.message,
    };
  }

  throw new FormatError(
    'FORMAT_FAILED',
    formatRes.message || 'TF卡格式化失败',
    { requestId, taskId },
  );
}
