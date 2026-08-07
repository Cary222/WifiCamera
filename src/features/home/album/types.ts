/**
 * Album / file API types — mirrors the camera firmware JSON contract.
 * snake_case is preserved for firmware compatibility.
 */

export type PicFolder = {
  name: string;
  path: string;
  size?: number;
  mtime?: number;
};

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
