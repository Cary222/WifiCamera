import * as React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { translate } from '@/lib/i18n';

export type FormatConfirmSheetProps = {
  visible: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
};

type ActionButtonsProps = {
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

function FormatSheetActions({ loading, onCancel, onConfirm }: ActionButtonsProps) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <Pressable
        testID="format-cancel-button"
        disabled={loading}
        onPress={onCancel}
        style={({ pressed }) => ({
          flex: 1,
          height: 48,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.3)',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text
          style={{
            fontSize: 15,
            fontWeight: '500',
            color: '#FFFFFF',
          }}
        >
          {translate('album.format_sheet.cancel')}
        </Text>
      </Pressable>

      <Pressable
        testID="format-confirm-button"
        disabled={loading}
        onPress={onConfirm}
        style={({ pressed }) => ({
          flex: 1,
          height: 48,
          borderRadius: 24,
          backgroundColor: '#CBFF3C',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed || loading ? 0.8 : 1,
        })}
      >
        {loading && <ActivityIndicator size="small" color="#000000" />}
        {!loading && (
          <Text
            style={{
              fontSize: 15,
              fontWeight: '600',
              color: '#000000',
            }}
          >
            {translate('album.format_sheet.confirm')}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

/**
 * Format confirmation bottom sheet matching camera album specs:
 * - Dark background (#111111)
 * - Rounded top corners (24px)
 * - Top handle indicator
 * - Title: 确认格式化TF卡
 * - Irreversible warning: TF卡内将被清除，已保存至手机相册的内容不会受到影响，该操作无法撤销。
 * - Outline cancel and Lime confirmation buttons
 */
export function FormatConfirmSheet({
  visible,
  onConfirm,
  onCancel,
  loading = false,
}: FormatConfirmSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={loading ? undefined : onCancel}
    >
      <TouchableWithoutFeedback onPress={loading ? undefined : onCancel}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            justifyContent: 'flex-end',
          }}
        >
          <TouchableWithoutFeedback onPress={e => e?.stopPropagation?.()}>
            <View
              testID="format-confirm-sheet"
              style={{
                backgroundColor: '#111111',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                paddingTop: 12,
                paddingHorizontal: 20,
                paddingBottom: Math.max(insets.bottom, 24),
                borderTopWidth: 0.5,
                borderColor: 'rgba(255, 255, 255, 0.1)',
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: '#444444',
                  alignSelf: 'center',
                  marginBottom: 16,
                }}
              />

              <Text
                testID="format-sheet-title"
                style={{
                  fontSize: 18,
                  fontWeight: '600',
                  color: '#FFFFFF',
                  textAlign: 'center',
                  marginBottom: 12,
                }}
              >
                {translate('album.format_sheet.title')}
              </Text>

              <Text
                testID="format-sheet-warning"
                style={{
                  fontSize: 13,
                  lineHeight: 20,
                  color: 'rgba(255, 255, 255, 0.65)',
                  textAlign: 'center',
                  paddingHorizontal: 8,
                  marginBottom: 28,
                }}
              >
                {translate('album.format_sheet.warning')}
              </Text>

              <FormatSheetActions
                loading={loading}
                onCancel={onCancel}
                onConfirm={onConfirm}
              />
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
