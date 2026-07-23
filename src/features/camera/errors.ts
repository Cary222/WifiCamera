/**
 * CameraApiError is the single error type every camera service throws.
 *
 * It distinguishes three failure modes callers must handle independently:
 *   - `kind: 'http'`    → non-2xx status from the camera HTTP layer.
 *   - `kind: 'network'` → axios never received a response (timeout, DNS, refused).
 *   - `kind: 'business'` → camera returned `{success:false,...}` on HTTP 200.
 *
 * `cause` always carries the original error for diagnostics.
 */
import type { CameraApiResponse } from './types';
import { isAxiosError } from 'axios';

export type CameraApiErrorKind = 'network' | 'http' | 'business';

export class CameraApiError extends Error {
  readonly kind: CameraApiErrorKind;
  readonly status?: number;
  readonly method?: string;
  readonly url?: string;
  readonly businessMessage?: string;
  readonly cause?: unknown;

  constructor(params: {
    kind: CameraApiErrorKind;
    message: string;
    status?: number;
    method?: string;
    url?: string;
    businessMessage?: string;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = 'CameraApiError';
    this.kind = params.kind;
    this.status = params.status;
    this.method = params.method;
    this.url = params.url;
    this.businessMessage = params.businessMessage;
    this.cause = params.cause;
  }

  /** Convert any axios-shaped failure into a CameraApiError. */
  static fromAxios(error: unknown): CameraApiError {
    if (isAxiosError(error)) {
      const status = error.response?.status;
      const method = error.config?.method?.toUpperCase();
      const url = error.config?.url;
      if (error.response) {
        return new CameraApiError({
          kind: 'http',
          status,
          method,
          url,
          message: `Camera HTTP ${status ?? '?'} ${method ?? ''} ${url ?? ''}`.trim(),
          cause: error,
        });
      }
      return new CameraApiError({
        kind: 'network',
        method,
        url,
        message: `Camera network error on ${method ?? ''} ${url ?? ''}: ${error.message}`.trim(),
        cause: error,
      });
    }
    return new CameraApiError({
      kind: 'network',
      message: error instanceof Error ? error.message : 'Unknown camera error',
      cause: error,
    });
  }

  /** Wrap a HTTP-200 response whose business payload signals failure. */
  static fromBusiness<T>(
    payload: CameraApiResponse<T>,
    method: string,
    url: string,
  ): CameraApiError {
    return new CameraApiError({
      kind: 'business',
      method: method.toUpperCase(),
      url,
      businessMessage: payload.message,
      message: `Camera business failure (${payload.message ?? 'unspecified'}) on ${method.toUpperCase()} ${url}`,
      cause: payload,
    });
  }
}

/**
 * Unwrap a camera API envelope.
 * Throws CameraApiError(business) when the firmware reports `success:false`.
 */
export function unwrapCamera<T>(
  payload: CameraApiResponse<T>,
  method: string,
  url: string,
): T {
  if (payload?.success === true) {
    return payload.data;
  }
  throw CameraApiError.fromBusiness(
    payload ?? { success: false, data: null },
    method,
    url,
  );
}
