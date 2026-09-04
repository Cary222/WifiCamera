import { fireEvent, render, screen } from '@testing-library/react-native';
import * as React from 'react';
import { formatLatitudeDMS, formatLongitudeDMS, formatUtcOffset } from './location-format';
import { LocationWorldMap } from './location-world-map';

describe('location world map formatting', () => {
  it('formats positive latitude as North with DMS', () => {
    expect(formatLatitudeDMS(39.9042)).toMatch(/39° 54' \d+" N/);
  });

  it('formats negative latitude as South with DMS', () => {
    expect(formatLatitudeDMS(-33.8688)).toMatch(/33° 52' \d+" S/);
  });

  it('formats positive longitude as East with DMS', () => {
    expect(formatLongitudeDMS(116.4074)).toMatch(/116° 24' \d+" E/);
  });

  it('formats negative longitude as West with DMS', () => {
    expect(formatLongitudeDMS(-122.4194)).toMatch(/122° 25' \d+" W/);
  });

  it('formats UTC offset cleanly', () => {
    expect(formatUtcOffset(-480)).toBe('+8:00');
    expect(formatUtcOffset(300)).toBe('-5:00');
  });
});

describe('location world map component', () => {
  it('renders world map with location pin', () => {
    render(
      <LocationWorldMap
        latitudeDeg={39.9}
        longitudeDeg={116.41}
        onSelectCoordinate={jest.fn()}
      />,
    );

    expect(screen.getByTestId('deep-space-location-world-map')).toBeOnTheScreen();
    expect(screen.getByTestId('deep-space-location-map-pin')).toBeOnTheScreen();
  });

  it('converts tap on map to latitude and longitude coordinates', () => {
    const onSelect = jest.fn();
    render(
      <LocationWorldMap
        latitudeDeg={0}
        longitudeDeg={0}
        onSelectCoordinate={onSelect}
      />,
    );

    const map = screen.getByTestId('deep-space-location-world-map');
    fireEvent(map, 'layout', { nativeEvent: { layout: { width: 360, height: 180 } } });

    fireEvent(map, 'press', { nativeEvent: { locationX: 180, locationY: 90 } });
    expect(onSelect).toHaveBeenCalledWith(expect.closeTo(0, 1), expect.closeTo(0, 1));
  });
});
