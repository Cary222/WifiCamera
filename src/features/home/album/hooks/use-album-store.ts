import type { PicFile, PicFolder } from '../types';

import { create } from 'zustand';
import { createSelectors } from '@/lib/utils';
import {
  deletePicFile,
  deletePicFolder,
  listPicFiles,
  listPicFolders,
} from '../services/album-service';

type AlbumState = {
  folders: PicFolder[];
  files: PicFile[];
  currentFolder: string;
  selectedFiles: Set<string>;
  loadingFolders: boolean;
  loadingFiles: boolean;
  deleting: boolean;
  foldersError: string | null;
  filesError: string | null;

  setFolders: (folders: PicFolder[]) => void;
  setFiles: (files: PicFile[]) => void;
  setCurrentFolder: (path: string) => void;
  loadFolders: () => Promise<void>;
  loadFiles: (sourceDir?: string) => Promise<void>;
  toggleFileSelection: (path: string) => void;
  clearSelection: () => void;
  deleteSelectedFiles: () => Promise<void>;
};

const _useAlbumStore = create<AlbumState>((set, get) => ({
  folders: [],
  files: [],
  currentFolder: '',
  selectedFiles: new Set(),
  loadingFolders: false,
  loadingFiles: false,
  deleting: false,
  foldersError: null,
  filesError: null,

  setFolders: folders => set({ folders }),
  setFiles: files => set({ files }),
  setCurrentFolder: path => set({ currentFolder: path, selectedFiles: new Set() }),

  loadFolders: async () => {
    set({ loadingFolders: true, foldersError: null });
    try {
      const folders = await listPicFolders();
      set({ folders });
    }
    catch (err) {
      set({ foldersError: err instanceof Error ? err.message : 'Failed to load folders' });
    }
    finally {
      set({ loadingFolders: false });
    }
  },

  loadFiles: async (sourceDir) => {
    const targetDir = sourceDir ?? get().currentFolder;
    set({ loadingFiles: true, filesError: null });
    try {
      const files = await listPicFiles(targetDir);
      set({ files });
    }
    catch (err) {
      set({ filesError: err instanceof Error ? err.message : 'Failed to load files' });
    }
    finally {
      set({ loadingFiles: false });
    }
  },

  toggleFileSelection: path => set((state) => {
    const next = new Set(state.selectedFiles);
    if (next.has(path)) {
      next.delete(path);
    }
    else {
      next.add(path);
    }
    return { selectedFiles: next };
  }),

  clearSelection: () => set({ selectedFiles: new Set() }),

  deleteSelectedFiles: async () => {
    const { selectedFiles, currentFolder } = get();
    if (selectedFiles.size === 0)
      return;

    set({ deleting: true });
    try {
      const filePromises: Promise<void>[] = [];
      const folderPromises: Promise<void>[] = [];

      for (const path of selectedFiles) {
        if (path.startsWith(`${currentFolder}/`)) {
          filePromises.push(deletePicFile(path).catch(() => {}));
        }
        else {
          folderPromises.push(deletePicFolder(path).catch(() => {}));
        }
      }

      await Promise.all([...folderPromises, ...filePromises]);
      set({ selectedFiles: new Set() });
    }
    finally {
      set({ deleting: false });
    }
  },
}));

export const useAlbumStore = createSelectors(_useAlbumStore);
