import { fireEvent, render, screen } from '@testing-library/react-native';
import * as React from 'react';

import { LandscapePanel } from './landscape-panel';

function renderPanel(overrides: Partial<React.ComponentProps<typeof LandscapePanel>> = {}) {
  const handlers = {
    activeId: 'guereins',
    environment: { cardinals: true, fog: true, turbidity: 3 },
    onClose: jest.fn(),
    onSelect: jest.fn(),
    onUpdateEnvironment: jest.fn(),
    ...overrides,
  };
  const view = render(<LandscapePanel {...handlers} />);
  return { handlers, view };
}

describe('landscape panel', () => {
  it('lists every bundled landscape plus the no-landscape option', () => {
    renderPanel();

    expect(screen.getByTestId('deep-space-landscape-option-none')).toBeTruthy();
    expect(screen.getByTestId('deep-space-landscape-option-guereins')).toBeTruthy();
    expect(screen.getByTestId('deep-space-landscape-option-winterfield')).toBeTruthy();
    expect(screen.getByTestId('deep-space-landscape-option-ocean')).toBeTruthy();
  });

  it('reports the landscape the observer picked', () => {
    const { handlers } = renderPanel();

    fireEvent.press(screen.getByTestId('deep-space-landscape-option-ocean'));

    expect(handlers.onSelect).toHaveBeenCalledWith('ocean');
  });

  it('marks the active landscape as selected for assistive technology', () => {
    renderPanel({ activeId: 'garching' });

    expect(screen.getByTestId('deep-space-landscape-option-garching').props.accessibilityState.selected).toBe(true);
  });

  it('toggles fog through the environment callback', () => {
    const { handlers } = renderPanel();

    fireEvent.press(screen.getByTestId('deep-space-landscape-toggle-fog'));

    expect(handlers.onUpdateEnvironment).toHaveBeenCalledWith({ fog: false });
  });

  it('picks an atmosphere turbidity preset', () => {
    const { handlers } = renderPanel();

    fireEvent.press(screen.getByTestId('deep-space-landscape-turbidity-8'));

    expect(handlers.onUpdateEnvironment).toHaveBeenCalledWith({ turbidity: 8 });
  });
});
