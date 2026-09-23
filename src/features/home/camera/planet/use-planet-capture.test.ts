import { act, renderHook } from '@testing-library/react-native';
import { useCameraStore } from '../camera-store';
import { PLANET_ROI_PRESETS, usePlanetCapture } from './use-planet-capture';

describe('usePlanetCapture parameter sync', () => {
  let switchAutoModeSpy: jest.SpyInstance;
  let changeStreamingSettingSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    useCameraStore.setState({
      connectionStatus: 'open',
      landscapeAutoMode: true,
    });
    switchAutoModeSpy = jest.spyOn(useCameraStore.getState(), 'switchAutoMode');
    changeStreamingSettingSpy = jest.spyOn(useCameraStore.getState(), 'changeStreamingSetting');
  });

  afterEach(() => {
    switchAutoModeSpy.mockRestore();
    changeStreamingSettingSpy.mockRestore();
    jest.useRealTimers();
  });

  it('switches to manual mode and applies initial exposure and gain on mount', () => {
    renderHook(() =>
      usePlanetCapture({
        exposure: 0.008,
        gain: 10,
        format: 'ser8',
        roiPreset: PLANET_ROI_PRESETS[0],
        aspectRatio: '16:9',
      }),
    );

    expect(switchAutoModeSpy).toHaveBeenCalledWith(false);
    expect(changeStreamingSettingSpy).toHaveBeenCalledWith(0.008, 10);
  });

  it('allows force applying same parameter through applyStreamingSetting', () => {
    const { result } = renderHook(() =>
      usePlanetCapture({
        exposure: 0.008,
        gain: 10,
        format: 'ser8',
        roiPreset: PLANET_ROI_PRESETS[0],
        aspectRatio: '16:9',
      }),
    );

    changeStreamingSettingSpy.mockClear();

    act(() => {
      result.current.applyStreamingSetting(0.008, 10, true);
    });

    expect(changeStreamingSettingSpy).toHaveBeenCalledWith(0.008, 10);
  });
});
