/**
 * Camera HTTP wire types.
 *
 * The legacy WifiCamera firmware returns a small JSON envelope for every
 * endpoint. The on-wire shape and field naming are kept in snake_case so the
 * request/response bodies stay byte-compatible with the device.
 *
 * Naming avoids collision with axios's own `{ data: T }` response wrapper.
 */

export type CameraApiSuccessResponse<T> = {
  success: true;
  data: T;
  message?: string;
};

export type CameraApiFailureResponse = {
  success: false;
  data: null;
  message?: string;
};

export type CameraApiResponse<T>
  = CameraApiSuccessResponse<T>
    | CameraApiFailureResponse;

export type CameraVersion = {
  server: string;
  hardware: string;
};

export type CameraSerial = {
  SN: string;
  magic: string;
  hardware: string;
  HD: string;
};

export type UpdateTimePayload = {
  /** ISO-8601-like string the camera firmware expects. */
  time: string;
  /** Numeric timezone offset. Field name preserved per firmware contract. */
  time_zone: number;
};
