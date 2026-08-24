import * as React from 'react';

import { render, screen } from '@/lib/test-utils';

import { Text } from './text';

describe('text component', () => {
  it('does not apply text-base fixed line height when a caller supplies fontSize', () => {
    render(
      <Text style={{ fontSize: 31 }} testID="large-text">
        18:54
      </Text>,
    );

    expect(screen.getByTestId('large-text').props.className).not.toContain('text-base');
  });
});
