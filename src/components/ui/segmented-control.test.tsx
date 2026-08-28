/* eslint-disable max-lines-per-function */
import * as React from 'react';

import { cleanup, screen, setup } from '@/lib/test-utils';

import { SegmentedControl } from './segmented-control';

import 'react-native';

afterEach(cleanup);

describe('segmentedControl component', () => {
  const defaultOptions = [
    { value: 'photo', label: '拍照' },
    { value: 'video', label: '视频' },
  ] as const;

  it('renders correctly with two options', () => {
    const mockOnChange = jest.fn();
    setup(
      <SegmentedControl<'photo' | 'video'>
        testID="segmented"
        options={defaultOptions}
        value="photo"
        onChange={mockOnChange}
      />,
    );
    expect(screen.getByTestId('segmented')).toBeOnTheScreen();
    expect(screen.getByText('拍照')).toBeOnTheScreen();
    expect(screen.getByText('视频')).toBeOnTheScreen();
  });

  it('renders with three options (transport selector style)', () => {
    const mockOnChange = jest.fn();
    const threeOptions = [
      { value: 'auto', label: 'Auto' },
      { value: 'usb', label: 'USB' },
      { value: 'wifi', label: 'Wi-Fi' },
    ] as const;
    setup(
      <SegmentedControl<'auto' | 'usb' | 'wifi'>
        testID="segmented"
        options={threeOptions}
        value="auto"
        onChange={mockOnChange}
        variant="neutral-fixed"
        segmentPixelWidth={62}
      />,
    );
    expect(screen.getByText('Auto')).toBeOnTheScreen();
    expect(screen.getByText('USB')).toBeOnTheScreen();
    expect(screen.getByText('Wi-Fi')).toBeOnTheScreen();
  });

  it('calls onChange when pressing an inactive option', async () => {
    const mockOnChange = jest.fn();
    const { user } = setup(
      <SegmentedControl<'photo' | 'video'>
        testID="segmented"
        options={defaultOptions}
        value="photo"
        onChange={mockOnChange}
      />,
    );
    await user.press(screen.getByText('视频'));
    expect(mockOnChange).toHaveBeenCalledTimes(1);
    expect(mockOnChange).toHaveBeenCalledWith('video');
  });

  it('does NOT call onChange when pressing the already-active option', async () => {
    const mockOnChange = jest.fn();
    const { user } = setup(
      <SegmentedControl<'photo' | 'video'>
        testID="segmented"
        options={defaultOptions}
        value="photo"
        onChange={mockOnChange}
      />,
    );
    await user.press(screen.getByText('拍照'));
    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('does NOT call onChange when the option is disabled', async () => {
    const mockOnChange = jest.fn();
    const { user } = setup(
      <SegmentedControl<'photo' | 'video'>
        testID="segmented"
        options={[
          { value: 'photo', label: '拍照' },
          { value: 'video', label: '视频', disabled: true },
        ]}
        value="photo"
        onChange={mockOnChange}
      />,
    );
    await user.press(screen.getByText('视频'));
    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('renders capsule-lg variant correctly', () => {
    const mockOnChange = jest.fn();
    setup(
      <SegmentedControl<'photo' | 'video'>
        testID="segmented"
        options={defaultOptions}
        value="photo"
        onChange={mockOnChange}
        variant="capsule-lg"
      />,
    );
    expect(screen.getByTestId('segmented')).toBeOnTheScreen();
    expect(screen.getByText('拍照')).toBeOnTheScreen();
    expect(screen.getByText('视频')).toBeOnTheScreen();
  });

  it('has correct accessibilityRole', () => {
    const mockOnChange = jest.fn();
    setup(
      <SegmentedControl<'photo' | 'video'>
        testID="segmented"
        options={defaultOptions}
        value="photo"
        onChange={mockOnChange}
      />,
    );
    expect(screen.getByTestId('segmented').props.accessibilityRole).toBe('tablist');
  });

  it('returns null for empty options', () => {
    const mockOnChange = jest.fn();
    const { toJSON } = setup(
      <SegmentedControl
        testID="segmented"
        options={[]}
        value="photo"
        onChange={mockOnChange}
      />,
    );
    expect(toJSON()).toBeNull();
  });
});
