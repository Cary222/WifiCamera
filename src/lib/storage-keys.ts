/**
 * Centralised MMKV storage keys.
 *
 * This is the single source of truth for every key written to or read from
 * the MMKV `storage` singleton (see `@/lib/storage`). Every call site that
 * needs a storage key MUST import from here rather than re-declaring a
 * string literal — that way renames, additions, and cross-feature audits
 * are a one-file change.
 *
 * Conventions:
 * - Key names use SCREAMING_SNAKE_CASE and are prefixed with the domain
 *   they belong to (e.g. `BOUND_*`, `AUTH_*`, `SELECTED_*`).
 * - The string literal on the right is the on-disk value and MUST stay in
 *   sync with whatever has already shipped to user devices. Renaming a
 *   value is a data-migration event, not a code change.
 */

/** Object form (preferred). Use `STORAGE_KEYS.X` at call sites. */
export const STORAGE_KEYS = {
  /** Has the user completed first-launch onboarding? (boolean) */
  IS_FIRST_TIME: 'IS_FIRST_TIME',
  /** Persisted UI language. Value is one of the `Language` union in `@/lib/i18n/resources`. */
  LANGUAGE: 'local',
  /** Selected theme: 'light' | 'dark' | 'system'. */
  SELECTED_THEME: 'SELECTED_THEME',
  /** Currently bound device's id (ESP8266 STAR). */
  BOUND_DEVICE_ID: 'BOUND_DEVICE_ID',
  /** Human-readable name of the bound device. */
  BOUND_DEVICE_NAME: 'BOUND_DEVICE_NAME',
  /** Serialised `{ access, refresh }` token object (see `TokenType` in `@/lib/auth/utils`). */
  AUTH_TOKEN: 'token',
  /** Camera link preference: 'auto' | 'usb' | 'wifi'. */
  CAMERA_TRANSPORT: 'CAMERA_TRANSPORT',
  /** WiFi mode camera IP address (e.g., '192.168.1.1'). */
  WIFI_CAMERA_IP: 'WIFI_CAMERA_IP',
  /** Serialised CelesTrak visual-group OMM records. */
  SATELLITE_VISUAL_OMM: 'SATELLITE_VISUAL_OMM',
  /** Unix milliseconds when the visual OMM cache was last refreshed. */
  SATELLITE_VISUAL_FETCHED_AT: 'SATELLITE_VISUAL_FETCHED_AT',
  /** Recently selected sky objects, stored as a compact JSON list. */
  DEEP_SPACE_RECENT_OBJECTS: 'DEEP_SPACE_RECENT_OBJECTS',
  /** Favorite sky object identifiers, stored as a compact JSON list. */
  DEEP_SPACE_FAVORITE_OBJECT_IDS: 'DEEP_SPACE_FAVORITE_OBJECT_IDS',
  /** Start time policy: 'now' | 'last_view'. */
  DEEP_SPACE_SETTINGS_START_TIME_POLICY: 'DEEP_SPACE_SETTINGS_START_TIME_POLICY',
  /** Last custom viewed star-map time (ISO string). */
  DEEP_SPACE_SETTINGS_LAST_VIEW_TIME: 'DEEP_SPACE_SETTINGS_LAST_VIEW_TIME',
  /** Whether star map runs in full screen mode. */
  DEEP_SPACE_SETTINGS_FULLSCREEN: 'DEEP_SPACE_SETTINGS_FULLSCREEN',
  /** Whether limiting magnitude filter is active. */
  DEEP_SPACE_SETTINGS_LIMIT_MAG_ENABLED: 'DEEP_SPACE_SETTINGS_LIMIT_MAG_ENABLED',
  /** Limiting magnitude cutoff value (number). */
  DEEP_SPACE_SETTINGS_LIMIT_MAG_VALUE: 'DEEP_SPACE_SETTINGS_LIMIT_MAG_VALUE',
  /** Star map display brightness multiplier (number). */
  DEEP_SPACE_SETTINGS_BRIGHTNESS: 'DEEP_SPACE_SETTINGS_BRIGHTNESS',
  /** Whether sensor/compass follow mode is active. */
  DEEP_SPACE_SETTINGS_SENSOR: 'DEEP_SPACE_SETTINGS_SENSOR',
  /** Serialized observer location object { latitudeDeg, longitudeDeg, name, source }. */
  DEEP_SPACE_SETTINGS_OBSERVER: 'DEEP_SPACE_SETTINGS_OBSERVER',
} as const;

/** Union of every key string. Useful for type-safe helpers. */
export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
