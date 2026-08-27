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
  vmag: -1.46,
};

describe('object info sheet', () => {
  it('renders celestial object details and coordinates', () => {
    render(<ObjectInfoSheet object={MOCK_STAR} onCenter={jest.fn()} onClose={jest.fn()} onGoto={jest.fn()} onZoomIn={jest.fn()} />);

    expect(screen.getByText('天狼星')).toBeTruthy();
    expect(screen.getByText('Sirius · α CMa')).toBeTruthy();
    expect(screen.getByText('-1.46')).toBeTruthy(); // vmag
    expect(screen.getByTestId('deep-space-object-center-btn')).toBeTruthy();
    expect(screen.getByTestId('deep-space-object-zoom-btn')).toBeTruthy();
    expect(screen.getByTestId('deep-space-object-goto-btn')).toBeTruthy();
  });

  it('triggers center tracking when center button is pressed', () => {
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

  it('triggers goto when goto telescope button is pressed', () => {
    const onGoto = jest.fn();
    render(<ObjectInfoSheet object={MOCK_STAR} onCenter={jest.fn()} onClose={jest.fn()} onGoto={onGoto} onZoomIn={jest.fn()} />);

    fireEvent.press(screen.getByTestId('deep-space-object-goto-btn'));
    expect(onGoto).toHaveBeenCalledWith(6.752, -16.716);
  });
});
