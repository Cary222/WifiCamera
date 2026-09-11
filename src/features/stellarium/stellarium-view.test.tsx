/* eslint-disable max-lines-per-function */
import type { StellariumViewHandle } from './stellarium-view';
import { act, render, screen } from '@testing-library/react-native';
import * as React from 'react';
import { StellariumView } from './stellarium-view';

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    WebView: ({ ref, ...props }: any) => {
      React.useImperativeHandle(ref, () => ({
        postMessage: jest.fn(),
        reload: jest.fn(),
      }));
      return React.createElement(View, { testID: 'mock-webview', ...props });
    },
  };
});

describe('stellariumView message dispatch and lifecycle', () => {
  it('dispatches query_targets_result and focus_target_result without crosstalk to legacy callbacks', async () => {
    const onObjectSelected = jest.fn();
    const onTargetFound = jest.fn();
    const viewRef = { current: null as StellariumViewHandle | null };

    render(
      <StellariumView
        ref={viewRef}
        onObjectSelected={onObjectSelected}
        onTargetFound={onTargetFound}
      />,
    );

    const webView = screen.getByTestId('mock-webview');

    // Simulate ready
    act(() => {
      webView.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'ready' }) },
      });
    });

    const bridge = viewRef.current!;
    expect(bridge).toBeDefined();

    // Start a focus target request
    const focusPromise = bridge.focusTarget('Mars');

    // Correlated response arrives
    act(() => {
      webView.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'focus_target_result',
            requestId: 1,
            object: {
              id: 'NAME Mars',
              name: '火星',
              englishName: 'Mars',
              type: 'planet',
              typeZh: '行星',
              raHours: 5,
              decDeg: 20,
              designations: ['NAME Mars'],
            },
          }),
        },
      });
    });

    const focusResult = await focusPromise;
    expect(focusResult?.englishName).toBe('Mars');

    // Crucial check: neither legacy callback was called!
    expect(onObjectSelected).not.toHaveBeenCalled();
    expect(onTargetFound).not.toHaveBeenCalled();

    // Start a query targets request
    const queryPromise = bridge.queryTargets(['Mars', 'M 31']);

    act(() => {
      webView.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'query_targets_result',
            requestId: 2,
            targets: [
              { id: 'Mars', available: true, altDeg: 40, azDeg: 120, vmag: 1.0 },
              { id: 'M 31', available: true, altDeg: 60, azDeg: 180, vmag: 3.5 },
            ],
          }),
        },
      });
    });

    const queryResult = await queryPromise;
    expect(queryResult).toHaveLength(2);
    expect(queryResult[0].id).toBe('Mars');
    expect(queryResult[1].id).toBe('M 31');
    expect(onObjectSelected).not.toHaveBeenCalled();
    expect(onTargetFound).not.toHaveBeenCalled();
  });

  it('preserves a correlated missing-data failure without opening object details', async () => {
    const ref = { current: null as StellariumViewHandle | null };
    const onObjectSelected = jest.fn();
    render(<StellariumView ref={ref} onObjectSelected={onObjectSelected} />);
    const webView = screen.getByTestId('mock-webview');
    act(() => webView.props.onMessage({ nativeEvent: { data: '{"type":"ready"}' } }));
    const result = ref.current!.focusTarget('M 40');
    const rejection = expect(result).rejects.toMatchObject({ reason: 'missing_data' });
    act(() => webView.props.onMessage({ nativeEvent: {
      data: JSON.stringify({ type: 'focus_target_result', requestId: 1, object: null, reason: 'missing_data' }),
    } }));
    await rejection;
    expect(onObjectSelected).not.toHaveBeenCalled();
  });

  it('preserves legacy object_selected and target_found for legacy search_target', () => {
    const onObjectSelected = jest.fn();
    const onTargetFound = jest.fn();
    const viewRef = { current: null as StellariumViewHandle | null };

    render(
      <StellariumView
        ref={viewRef}
        onObjectSelected={onObjectSelected}
        onTargetFound={onTargetFound}
      />,
    );

    const webView = screen.getByTestId('mock-webview');

    act(() => {
      webView.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'ready' }) },
      });
    });

    // Legacy search event simulation
    act(() => {
      webView.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'object_selected',
            object: {
              id: 'NAME Mars',
              name: '火星',
              englishName: 'Mars',
              raHours: 5,
              decDeg: 20,
              designations: ['NAME Mars'],
            },
          }),
        },
      });
    });

    act(() => {
      webView.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: 'target_found' }),
        },
      });
    });

    expect(onObjectSelected).toHaveBeenCalledTimes(1);
    expect(onTargetFound).toHaveBeenCalledTimes(1);
  });
});

describe('stellariumView camera view reports', () => {
  it('forwards a legal view report to the map', () => {
    const onViewStateChange = jest.fn();
    render(<StellariumView onViewStateChange={onViewStateChange} />);
    const webView = screen.getByTestId('mock-webview');

    act(() => {
      webView.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: 'view_state', state: { altitudeDeg: 12.5, azimuthDeg: 271.2, fovDeg: 30.5 } }),
        },
      });
    });
    act(() => {
      webView.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: 'view_state', state: { altitudeDeg: 0, azimuthDeg: 180, fovDeg: 182.28 } }),
        },
      });
    });

    expect(onViewStateChange).toHaveBeenNthCalledWith(1, { altitudeDeg: 12.5, azimuthDeg: 271.2, fovDeg: 30.5 });
    expect(onViewStateChange).toHaveBeenNthCalledWith(2, { altitudeDeg: 0, azimuthDeg: 180, fovDeg: 182.28 });
  });

  it.each([
    ['an azimuth of exactly 360', { altitudeDeg: 10, azimuthDeg: 360, fovDeg: 45 }],
    ['a negative azimuth', { altitudeDeg: 10, azimuthDeg: -1, fovDeg: 45 }],
    ['an altitude past the zenith', { altitudeDeg: 91, azimuthDeg: 10, fovDeg: 45 }],
    ['a zero field of view', { altitudeDeg: 10, azimuthDeg: 10, fovDeg: 0 }],
    ['a field of view past 360', { altitudeDeg: 10, azimuthDeg: 10, fovDeg: 400 }],
    ['a non-finite field', { altitudeDeg: Number.NaN, azimuthDeg: 10, fovDeg: 45 }],
    ['a missing field', { azimuthDeg: 10, altitudeDeg: 10 }],
    ['a null state', null],
  ])('drops %s without breaking the scene', (_label, state) => {
    const onViewStateChange = jest.fn();
    const onError = jest.fn();
    render(<StellariumView onError={onError} onViewStateChange={onViewStateChange} />);
    const webView = screen.getByTestId('mock-webview');

    act(() => {
      webView.props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'view_state', state }) } });
    });

    expect(onViewStateChange).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
