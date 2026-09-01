import { fireEvent, render, screen } from '@testing-library/react-native';
import * as React from 'react';

import { ObjectInfoSheet } from './object-info-sheet';

const MOCK_STAR = {
  altDeg: 45.2,
  azDeg: 180.5,
  decDeg: -16.716,
  designations: ['α CMa', 'HR 2491'],
  distanceAu: 543872.6,
  englishName: 'Sirius',
  id: 'NAME Sirius',
  name: '天狼星',
  raHours: 6.752,
  type: 'star',
  typeZh: '恒星',
  vmag: -1.46,
};

describe('object info sheet', () => {
  it('renders celestial object details and coordinates aligned with Stellarium UI', () => {
    render(<ObjectInfoSheet object={MOCK_STAR} onCenter={jest.fn()} onClose={jest.fn()} onGoto={jest.fn()} onZoomIn={jest.fn()} />);

    expect(screen.getByText('天狼星')).toBeTruthy();
    expect(screen.getByText('恒星')).toBeTruthy();
    expect(screen.getByText('RA/Dec')).toBeTruthy();
    expect(screen.getByText('Az/Alt')).toBeTruthy();
    expect(screen.getByText('时角')).toBeTruthy();
    expect(screen.getByText('RA/Dec (J2000)')).toBeTruthy();

    expect(screen.getByTestId('deep-space-object-center-btn')).toBeTruthy();
    expect(screen.getByTestId('deep-space-object-3d-btn')).toBeTruthy();
    expect(screen.getByTestId('deep-space-object-zoom-btn')).toBeTruthy();
    expect(screen.getByTestId('deep-space-object-zoom-out-btn')).toBeTruthy();
    expect(screen.getByTestId('deep-space-object-like-btn')).toBeTruthy();
    expect(screen.getByTestId('deep-space-object-goto-btn')).toBeTruthy();
  });

  it('flips to physical properties page when tapping page stepper', () => {
    render(<ObjectInfoSheet object={MOCK_STAR} onCenter={jest.fn()} onClose={jest.fn()} onGoto={jest.fn()} onZoomIn={jest.fn()} />);

    expect(screen.getByTestId('deep-space-object-coords-page')).toBeTruthy();

    fireEvent.press(screen.getByTestId('deep-space-object-page-next'));
    expect(screen.getByTestId('deep-space-object-physical-page')).toBeTruthy();
    expect(screen.getByText('星座')).toBeTruthy();
    expect(screen.getByText('星等')).toBeTruthy();
    expect(screen.getByText('距离')).toBeTruthy();
    expect(screen.getByText('阶段')).toBeTruthy();
    expect(screen.getByText('直径')).toBeTruthy();
    expect(screen.getByText('-1.46')).toBeTruthy();

    fireEvent.press(screen.getByTestId('deep-space-object-page-prev'));
    expect(screen.getByTestId('deep-space-object-coords-page')).toBeTruthy();
  });

  it('triggers center tracking when visibility pill button is pressed', () => {
    const onCenter = jest.fn();
    render(<ObjectInfoSheet object={MOCK_STAR} onCenter={onCenter} onClose={jest.fn()} onGoto={jest.fn()} onZoomIn={jest.fn()} />);

    fireEvent.press(screen.getByTestId('deep-space-object-center-btn'));
    expect(onCenter).toHaveBeenCalledWith(MOCK_STAR);
  });

  it('triggers zoom in when zoom button is pressed', () => {
    const onZoomIn = jest.fn();
    render(<ObjectInfoSheet object={MOCK_STAR} onCenter={jest.fn()} onClose={jest.fn()} onGoto={jest.fn()} onZoomIn={onZoomIn} />);

    fireEvent.press(screen.getByTestId('deep-space-object-zoom-btn'));
    expect(onZoomIn).toHaveBeenCalledWith(MOCK_STAR);
  });

  it('triggers zoom out when minus zoom button is pressed', () => {
    const onZoomOut = jest.fn();
    render(<ObjectInfoSheet object={MOCK_STAR} onCenter={jest.fn()} onClose={jest.fn()} onGoto={jest.fn()} onZoomIn={jest.fn()} onZoomOut={onZoomOut} />);

    fireEvent.press(screen.getByTestId('deep-space-object-zoom-out-btn'));
    expect(onZoomOut).toHaveBeenCalledWith(MOCK_STAR);
  });

  it('triggers goto when goto telescope button is pressed', () => {
    const onGoto = jest.fn();
    render(<ObjectInfoSheet object={MOCK_STAR} onCenter={jest.fn()} onClose={jest.fn()} onGoto={onGoto} onZoomIn={jest.fn()} />);

    fireEvent.press(screen.getByTestId('deep-space-object-goto-btn'));
    expect(onGoto).toHaveBeenCalledWith(6.752, -16.716);
  });

  it('toggles like state when heart button is pressed', () => {
    render(<ObjectInfoSheet object={MOCK_STAR} onCenter={jest.fn()} onClose={jest.fn()} onGoto={jest.fn()} onZoomIn={jest.fn()} />);

    const likeBtn = screen.getByTestId('deep-space-object-like-btn');
    fireEvent.press(likeBtn);
    fireEvent.press(likeBtn);
  });
});
