import type { TxKeyPath } from '@/lib/i18n';

// ---------------------------------------------------------------------------
// New UI types (AlbumData structure)
// ---------------------------------------------------------------------------

export type PhotoItem = {
  /** Unique id within the date group */
  id: string;
  /** Object/target name shown on the tile (e.g. "M33") */
  target: string;
  /** Exposure time, e.g. "30S" */
  exposure: string;
  /** Camera gain, e.g. "Gain 130" */
  gain: string;
  /** Optional badge number shown at top-right of the tile */
  badge?: string;
  /** ISO timestamp, e.g. "2026-05-22 22:35" */
  timestamp: string;
  /** Absolute board path for real media; absent for mock entries. */
  path?: string;
  /** Board `/get_image?path=` URL used by tile and full-screen preview. */
  previewUrl?: string;
};

export type DateGroup = {
  /** Unique id for the date group */
  id: string;
  /** Display label, e.g. "2026年5月22日" */
  dateLabel: TxKeyPath | string;
  /** Photos belonging to this date */
  items: PhotoItem[];
};

/** Storage card state for the top TF card. */
export type StorageCardState = {
  name: TxKeyPath | string;
  usedGB: number;
  totalGB: number;
};

export type AlbumData = {
  storage: StorageCardState;
  groups: DateGroup[];
};

// ---------------------------------------------------------------------------
// Camera HTTP API types (flat folder/file list — snake_case for firmware compat)
// ---------------------------------------------------------------------------

/** Matches the camera firmware `PicFolder` JSON shape. */
export type PicFolder = {
  name: string;
  path?: string;
  size?: number;
  mtime?: number;
  /** True when this folder is from mock data (camera unreachable). */
  _mock?: boolean;
};

/** Matches the camera firmware `PicFile` JSON shape. */
export type PicFile = {
  name: string;
  path: string;
  size?: number;
  mtime?: number;
  has_preview: boolean;
  full_path?: string;
  /** base64 data URI for preview thumbnail */
  thumbUrl?: string;
  /** base64 data URI for full image */
  url?: string;
};

export type ListPicFoldersResponse = {
  success: true;
  data: {
    pic_folders: PicFolder[];
  };
  message?: string;
};

export type ListPicFilesResponse = {
  success: true;
  data: {
    pic_files: PicFile[];
  };
  message?: string;
};

export type DeleteResponse = {
  success: true;
  data: {
    del: boolean;
  };
  message?: string;
};
