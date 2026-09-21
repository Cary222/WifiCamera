import { fireEvent, render, screen } from '@testing-library/react-native';
import * as React from 'react';
import { FormatConfirmSheet } from './format-confirm-sheet';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 20, left: 0, right: 0 }),
}));

describe('formatConfirmSheet', () => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders title, warning message and both action buttons', () => {
    render(
      <FormatConfirmSheet
        visible={true}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByTestId('format-sheet-title')).toBeTruthy();
    expect(screen.getByText('确认格式化TF卡')).toBeTruthy();
    expect(
      screen.getByText(
        'TF卡内所有内容（包括照片、视频及其他文件）将被清空，已保存至手机相册的内容不会受到影响，该操作无法撤销。',
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('format-cancel-button')).toBeTruthy();
    expect(screen.getByTestId('format-confirm-button')).toBeTruthy();
  });

  it('triggers onCancel when cancel button is pressed', () => {
    render(
      <FormatConfirmSheet
        visible={true}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.press(screen.getByTestId('format-cancel-button'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('triggers onConfirm when confirm button is pressed', () => {
    render(
      <FormatConfirmSheet
        visible={true}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.press(screen.getByTestId('format-confirm-button'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('disables buttons when loading is true', () => {
    render(
      <FormatConfirmSheet
        visible={true}
        loading={true}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    const cancelBtn = screen.getByTestId('format-cancel-button');
    const confirmBtn = screen.getByTestId('format-confirm-button');

    expect(cancelBtn.props.accessibilityState?.disabled).toBe(true);
    expect(confirmBtn.props.accessibilityState?.disabled).toBe(true);
  });
});
