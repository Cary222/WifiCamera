import type { PhotoItem } from '../types';
import * as Sharing from 'expo-sharing';
import * as React from 'react';
import { Alert } from 'react-native';
import { translate } from '@/lib/i18n';
import { useCameraStore } from '../../camera';
import {
  deletePicFile,
  downloadImageFile,
  saveImageToPhone,
} from '../services/album-service';
import { watermarkLocalImageFile } from '../services/image-watermark-service';

type UseImageViewerActionsParams = {
  item: PhotoItem | null;
  onClose: () => void;
  onDeleted?: (item: PhotoItem) => void;
};

function confirmDeleteDialog(onConfirm: () => void) {
  Alert.alert(
    translate('album.viewer.delete_confirm_title'),
    translate('album.viewer.delete_confirm_message'),
    [
      { text: translate('album.viewer.delete_cancel'), style: 'cancel' },
      {
        text: translate('album.viewer.delete_confirm'),
        style: 'destructive',
        onPress: onConfirm,
      },
    ],
  );
}

function notifySaveError(error: unknown) {
  if (error instanceof Error && error.message === 'PERMISSION_DENIED') {
    Alert.alert(
      translate('album.viewer.permission_denied_title'),
      translate('album.viewer.permission_denied_message'),
    );
  }
  else {
    Alert.alert('保存失败', translate('album.viewer.save_failed'));
  }
}

export function useImageViewerActions({
  item,
  onClose,
  onDeleted,
}: UseImageViewerActionsParams) {
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isSharing, setIsSharing] = React.useState(false);
  const watermark = useCameraStore.use.landscapeWatermark();

  const isBusy = isSaving || isDeleting || isSharing;

  const handleSave = React.useCallback(async () => {
    if (!item || isBusy)
      return;

    setIsSaving(true);
    try {
      await saveImageToPhone({
        previewUrl: item.previewUrl,
        path: item.path,
        watermark,
      });
      Alert.alert(translate('album.viewer.save_success'));
    }
    catch (error) {
      notifySaveError(error);
    }
    finally {
      setIsSaving(false);
    }
  }, [item, isBusy]);

  const executeDelete = React.useCallback(async () => {
    if (!item || isDeleting)
      return;

    setIsDeleting(true);
    try {
      if (item.path) {
        await deletePicFile(item.path);
      }
      onClose();
      onDeleted?.(item);
    }
    catch (error) {
      console.warn('[ImageViewer] delete failed', error);
      Alert.alert('删除失败', translate('album.viewer.delete_failed'));
    }
    finally {
      setIsDeleting(false);
    }
  }, [item, isDeleting, onClose, onDeleted]);

  const handleDelete = React.useCallback(() => {
    if (!item || isBusy)
      return;

    confirmDeleteDialog(() => {
      void executeDelete();
    });
  }, [item, isBusy, executeDelete]);

  const handleShare = React.useCallback(async () => {
    if (!item || isBusy)
      return;

    setIsSharing(true);
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('提示', translate('album.viewer.share_unavailable'));
        return;
      }

      const localUri = await downloadImageFile({
        previewUrl: item.previewUrl,
        path: item.path,
      });
      const fileToShare = watermark ? await watermarkLocalImageFile(localUri) : localUri;

      await Sharing.shareAsync(fileToShare, {
        dialogTitle: item.target,
        mimeType: 'image/jpeg',
        UTI: 'public.jpeg',
      });
    }
    catch (error) {
      console.warn('[ImageViewer] share failed', error);
      Alert.alert('分享失败', translate('album.viewer.share_failed'));
    }
    finally {
      setIsSharing(false);
    }
  }, [item, isBusy]);

  return {
    isBusy,
    isSaving,
    isDeleting,
    isSharing,
    handleSave,
    handleDelete,
    handleShare,
  };
}
