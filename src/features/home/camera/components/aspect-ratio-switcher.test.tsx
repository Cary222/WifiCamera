import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react-native';
import * as React from 'react';
import * as ReactNative from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAspectRatioAnimation } from './aspect-ratio-switcher';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      {children}
    </SafeAreaProvider>
  );
}

describe('useAspectRatioAnimation', () => {
  const defaultDimensions = ReactNative.Dimensions.get('window');
  afterEach(() => {
    act(() => {
      ReactNative.Dimensions.set({
        window: defaultDimensions,
        screen: defaultDimensions,
      });
    });
  });
  it('calculates portrait 9:16 and 3:4 adaptive viewports with 90-degree rotation', () => {
    const { result: r16_9 } = renderHook(
      () => useAspectRatioAnimation('16:9'),
      { wrapper },
    );
    const { result: r4_3 } = renderHook(() => useAspectRatioAnimation('4:3'), {
      wrapper,
    });

    expect(r16_9.current.isPortrait).toBe(true);
    expect(r16_9.current.rotation).toBe(90);
    expect(r4_3.current.rotation).toBe(90);
    expect(r16_9.current.scale).toBe(1);
    expect(r4_3.current.scale).toBe(1);

    // In vertical portrait: 9:16 is taller than 3:4
    expect(r16_9.current.previewHeight).toBeGreaterThan(
      r4_3.current.previewHeight,
    );
    expect(
      r16_9.current.previewHeight / r16_9.current.previewWidth,
    ).toBeCloseTo(16 / 9, 1);
    expect(r4_3.current.previewHeight / r4_3.current.previewWidth).toBeCloseTo(
      4 / 3,
      1,
    );

    // Surface dimensions are kept constant so ratio switching never resizes RTCView
    expect(r16_9.current.surfaceWidth).toBe(r4_3.current.surfaceWidth);
    expect(r16_9.current.surfaceHeight).toBe(r4_3.current.surfaceHeight);
    expect(
      r16_9.current.surfaceWidth / r16_9.current.surfaceHeight,
    ).toBeCloseTo(16 / 9, 1);
  });

  it('calculates landscape 16:9 and 4:3 viewports with 0-degree rotation', () => {
    act(() => {
      ReactNative.Dimensions.set({
        window: { width: 844, height: 390, scale: 1, fontScale: 1 },
        screen: { width: 844, height: 390, scale: 1, fontScale: 1 },
      });
    });

    const { result: r16_9 } = renderHook(
      () => useAspectRatioAnimation('16:9'),
      { wrapper },
    );
    const { result: r4_3 } = renderHook(() => useAspectRatioAnimation('4:3'), {
      wrapper,
    });

    expect(r16_9.current.isPortrait).toBe(false);
    expect(r16_9.current.rotation).toBe(0);
    expect(r4_3.current.rotation).toBe(0);
    expect(r16_9.current.scale).toBe(1);
    expect(r4_3.current.scale).toBe(1);

    // Surface width/height are unrotated in landscape
    expect(r16_9.current.surfaceWidth).toBe(r4_3.current.surfaceWidth);
    expect(r16_9.current.surfaceHeight).toBe(r4_3.current.surfaceHeight);
    expect(
      r16_9.current.previewWidth / r16_9.current.previewHeight,
    ).toBeCloseTo(16 / 9, 1);
    expect(r4_3.current.previewWidth / r4_3.current.previewHeight).toBeCloseTo(
      4 / 3,
      1,
    );
  });
});
