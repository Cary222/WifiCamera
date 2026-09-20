import type { ObjectInfoSheetProps } from './object-info-types';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import * as React from 'react';

import { storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { showDeepSpaceFeedback } from '../ui/deep-space-feedback';
import { ObjectInfoSheet } from './object-info-sheet';

jest.mock('../ui/deep-space-feedback', () => ({
  showDeepSpaceFeedback: jest.fn(),
}));

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

function renderObject(overrides: Partial<ObjectInfoSheetProps['object']> = {}) {
  return render(<ObjectInfoSheet object={{ ...MOCK_STAR, ...overrides }} onCenter={jest.fn()} onClose={jest.fn()} onZoomIn={jest.fn()} />);
}

describe('object info sheet coordinate integrity', () => {
  it('does not reuse date coordinates as missing J2000 coordinates', () => {
    renderObject();
    expect(screen.getByText('--   --')).toBeTruthy();
    expect(screen.getByText('06h  45m  07.2s   -16°  42\'  57.6"')).toBeTruthy();
  });

  it('uses explicit J2000 fields independently, including zero', () => {
    renderObject({ decJ2000Deg: 0, raJ2000Hours: 0 });
    expect(screen.getByText('00h  00m  00.0s   +00°  00\'  00.0"')).toBeTruthy();
  });

  it('leaves only the missing member of a J2000 pair unknown', () => {
    renderObject({ decJ2000Deg: null, raJ2000Hours: 1.5 });
    expect(screen.getByText('01h  30m  00.0s   --')).toBeTruthy();
  });

  it('retains zero coordinates and altitude instead of treating them as missing', () => {
    renderObject({ altDeg: 0, azDeg: 0, decDeg: 0, hourAngleHours: 0, raHours: 0 });
    expect(screen.getByText('000°  00\'  00.0"   +00°  00\'  00.0"')).toBeTruthy();
    expect(screen.getByText('00h  00m  00.0s   +00°  00\'  00.0"')).toBeTruthy();
    expect(screen.getByText('00h  00m  00.0s')).toBeTruthy();
  });

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('shows unknown for invalid coordinate fields: %s', (value) => {
    renderObject({
      altDeg: value,
      azDeg: value,
      decDeg: value as number,
      decJ2000Deg: value,
      hourAngleHours: value,
      raHours: value as number,
      raJ2000Hours: value,
    });
    const page = within(screen.getByTestId('deep-space-object-coords-page'));
    expect(page.getAllByText('--   --')).toHaveLength(3);
    expect(page.getByText('--')).toBeTruthy();
  });

  it('reflects new object data without retaining the prior J2000 coordinates', () => {
    const { rerender } = renderObject({ decJ2000Deg: 30, raJ2000Hours: 1.5 });
    expect(screen.getByText('01h  30m  00.0s   +30°  00\'  00.0"')).toBeTruthy();
    rerender(<ObjectInfoSheet object={{ ...MOCK_STAR, altDeg: -10, azDeg: 90 }} onCenter={jest.fn()} onClose={jest.fn()} onZoomIn={jest.fn()} />);
    expect(screen.getByText('--   --')).toBeTruthy();
    expect(screen.getByText('090°  00\'  00.0"   -10°  00\'  00.0"')).toBeTruthy();
  });
});

describe('object info sheet coordinate frame labels', () => {
  it('labels CIRS coordinates explicitly while preserving the separate J2000 row', () => {
    renderObject({ coordinateFrame: 'CIRS', decDeg: 20, decJ2000Deg: 19.5, raHours: 1.5, raJ2000Hours: 1.25 });

    expect(screen.getByText('RA/Dec (CIRS)')).toBeTruthy();
    expect(screen.queryByText('RA/Dec')).toBeNull();
    expect(screen.getByText('01h  30m  00.0s   +20°  00\'  00.0"')).toBeTruthy();
    expect(screen.getByText('RA/Dec (J2000)')).toBeTruthy();
    expect(screen.getByText('01h  15m  00.0s   +19°  30\'  00.0"')).toBeTruthy();
  });

  it('keeps the legacy coordinate label when no frame is declared', () => {
    renderObject({ decJ2000Deg: 19.5, raJ2000Hours: 1.25 });
    expect(screen.getByText('RA/Dec')).toBeTruthy();
    expect(screen.queryByText('RA/Dec (CIRS)')).toBeNull();
  });
});

describe('object info sheet supported actions', () => {
  it.each<Partial<ObjectInfoSheetProps['object']>>([
    {},
    { coordinateFrame: 'CIRS', decJ2000Deg: 19.5, raJ2000Hours: 1.25 },
    { decDeg: 0, raHours: 0 },
  ])('does not offer unsupported telescope pointing for coordinates %j', (coordinates) => {
    renderObject(coordinates);

    expect(screen.queryByTestId('deep-space-object-goto-btn')).toBeNull();
    expect(screen.queryByText('指向望远镜')).toBeNull();
    expect(screen.queryByRole('button', { name: '望远镜指向' })).toBeNull();
    expect(screen.getByTestId('deep-space-object-center-btn')).toBeEnabled();
    expect(screen.getByTestId('deep-space-object-like-btn')).toBeEnabled();
    expect(screen.getByTestId('deep-space-object-zoom-btn')).toBeEnabled();
    expect(screen.getByTestId('deep-space-object-zoom-out-btn')).toBeEnabled();
    expect(screen.getByTestId('deep-space-object-close-btn')).toBeEnabled();
  });
});

describe('object info sheet physical property integrity', () => {
  it.each([undefined, null, '', '   '])('does not estimate constellation from coordinates when the field is %s', (constellationZh) => {
    renderObject({ constellationZh });
    fireEvent.press(screen.getByTestId('deep-space-object-page-next'));
    expect(screen.queryByText('大犬座')).toBeNull();
    expect(within(screen.getByTestId('deep-space-object-physical-page')).getAllByText('--')).toHaveLength(3);
  });

  it('uses the supplied constellation and retains zero magnitude and phase', () => {
    renderObject({ constellationZh: '大犬座', distanceAu: 1, phase: 0, sizeArcsec: 12.5, vmag: 0 });
    fireEvent.press(screen.getByTestId('deep-space-object-page-next'));
    expect(screen.getByText('大犬座')).toBeTruthy();
    expect(screen.getAllByText('0.00')).toHaveLength(2);
    expect(screen.getByText('1.00 AU')).toBeTruthy();
    expect(screen.getByText('12.50"')).toBeTruthy();
  });

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('does not display invalid physical values: %s', (value) => {
    renderObject({ distanceAu: value, phase: value, sizeArcsec: value, type: 'moon', vmag: value });
    fireEvent.press(screen.getByTestId('deep-space-object-page-next'));
    expect(within(screen.getByTestId('deep-space-object-physical-page')).getAllByText('--')).toHaveLength(5);
    expect(JSON.stringify(screen.toJSON())).not.toContain('NaN');
    expect(JSON.stringify(screen.toJSON())).not.toContain('Infinity');
  });

  it.each([-0.1, 1.1])('does not draw a fabricated phase for the out-of-range value %s', (phase) => {
    const { rerender } = renderObject({ phase, type: 'moon' });
    const invalidPhaseTree = screen.toJSON();
    rerender(<ObjectInfoSheet object={{ ...MOCK_STAR, phase: null, type: 'moon' }} onCenter={jest.fn()} onClose={jest.fn()} onZoomIn={jest.fn()} />);
    expect(screen.toJSON()).toEqual(invalidPhaseTree);
  });
});

describe('object info sheet catalog favorite identity', () => {
  const values = new Map<string, string>();
  const nativeObject = { ...MOCK_STAR, catalogId: 'Megrez', englishName: 'Megrez', id: '* del UMa', name: 'Megrez' };

  beforeEach(() => {
    values.clear();
    jest.mocked(showDeepSpaceFeedback).mockClear();
    jest.mocked(storage.getString).mockImplementation(key => values.get(key));
    jest.mocked(storage.set).mockImplementation((key, value) => {
      if (typeof value === 'string') {
        values.set(key, value);
      }
    });
  });

  afterEach(() => {
    jest.mocked(storage.getString).mockReset();
    jest.mocked(storage.set).mockReset();
  });

  it('adds and removes the catalog identity instead of the native engine identity', () => {
    render(<ObjectInfoSheet object={nativeObject} onCenter={jest.fn()} onClose={jest.fn()} onZoomIn={jest.fn()} />);

    fireEvent.press(screen.getByTestId('deep-space-object-like-btn'));
    expect(storage.getString(STORAGE_KEYS.DEEP_SPACE_FAVORITE_OBJECT_IDS)).toBe('["Megrez"]');
    fireEvent.press(screen.getByTestId('deep-space-object-like-btn'));
    expect(storage.getString(STORAGE_KEYS.DEEP_SPACE_FAVORITE_OBJECT_IDS)).toBe('[]');
  });

  it('recognizes an existing catalog favorite on mount without adding a duplicate native id', () => {
    storage.set(STORAGE_KEYS.DEEP_SPACE_FAVORITE_OBJECT_IDS, '["Megrez","M 31"]');
    render(<ObjectInfoSheet object={nativeObject} onCenter={jest.fn()} onClose={jest.fn()} onZoomIn={jest.fn()} />);

    fireEvent.press(screen.getByTestId('deep-space-object-like-btn'));
    expect(storage.getString(STORAGE_KEYS.DEEP_SPACE_FAVORITE_OBJECT_IDS)).toBe('["M 31"]');
    expect(showDeepSpaceFeedback).toHaveBeenLastCalledWith({ message: '已取消收藏Megrez', tone: 'success' });
  });

  it('uses the engine identity when no catalog identity is supplied', () => {
    renderObject();
    fireEvent.press(screen.getByTestId('deep-space-object-like-btn'));
    expect(storage.getString(STORAGE_KEYS.DEEP_SPACE_FAVORITE_OBJECT_IDS)).toBe('["NAME Sirius"]');
  });

  it('keeps the native object and id for centering and both zoom directions', () => {
    const onCenter = jest.fn();
    const onZoomIn = jest.fn();
    const onZoomOut = jest.fn();
    render(<ObjectInfoSheet object={nativeObject} onCenter={onCenter} onClose={jest.fn()} onZoomIn={onZoomIn} onZoomOut={onZoomOut} />);

    fireEvent.press(screen.getByTestId('deep-space-object-center-btn'));
    fireEvent.press(screen.getByTestId('deep-space-object-zoom-btn'));
    fireEvent.press(screen.getByTestId('deep-space-object-zoom-out-btn'));
    expect(onCenter).toHaveBeenCalledWith(nativeObject);
    expect(onZoomIn).toHaveBeenCalledWith(nativeObject);
    expect(onZoomOut).toHaveBeenCalledWith(nativeObject);
    expect(nativeObject.id).toBe('* del UMa');
  });
});

describe('object info sheet truthful actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('labels real centering honestly without an unconfirmed success notification', () => {
    const onCenter = jest.fn();
    render(<ObjectInfoSheet object={MOCK_STAR} onCenter={onCenter} onClose={jest.fn()} onZoomIn={jest.fn()} />);

    const centerButton = screen.getByTestId('deep-space-object-center-btn');
    fireEvent.press(centerButton);
    expect(onCenter).toHaveBeenCalledWith(MOCK_STAR);
    expect(showDeepSpaceFeedback).not.toHaveBeenCalled();
    expect(centerButton).toBeEnabled();
    expect(screen.getByText('居中')).toBeTruthy();
    expect(screen.queryByText('可见度')).toBeNull();
  });

  it('does not substitute zooming or announce success for unavailable 3D', () => {
    const onZoomIn = jest.fn();
    render(<ObjectInfoSheet object={MOCK_STAR} onCenter={jest.fn()} onClose={jest.fn()} onZoomIn={onZoomIn} />);

    const threeDButton = screen.getByTestId('deep-space-object-3d-btn');
    fireEvent.press(threeDButton);
    expect(onZoomIn).not.toHaveBeenCalled();
    expect(showDeepSpaceFeedback).not.toHaveBeenCalled();
    expect(threeDButton).toBeDisabled();
    expect(screen.getByText('3D 视图暂不可用')).toBeTruthy();
  });
});

describe('object info sheet', () => {
  it('renders celestial object details and coordinates aligned with Stellarium UI', () => {
    render(<ObjectInfoSheet object={MOCK_STAR} onCenter={jest.fn()} onClose={jest.fn()} onZoomIn={jest.fn()} />);

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
    expect(screen.queryByTestId('deep-space-object-goto-btn')).toBeNull();
  });

  it('flips to physical properties page when tapping page stepper', () => {
    render(<ObjectInfoSheet object={MOCK_STAR} onCenter={jest.fn()} onClose={jest.fn()} onZoomIn={jest.fn()} />);

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

  it('triggers zoom in when zoom button is pressed', () => {
    const onZoomIn = jest.fn();
    render(<ObjectInfoSheet object={MOCK_STAR} onCenter={jest.fn()} onClose={jest.fn()} onZoomIn={onZoomIn} />);

    fireEvent.press(screen.getByTestId('deep-space-object-zoom-btn'));
    expect(onZoomIn).toHaveBeenCalledWith(MOCK_STAR);
  });

  it('triggers zoom out when minus zoom button is pressed', () => {
    const onZoomOut = jest.fn();
    render(<ObjectInfoSheet object={MOCK_STAR} onCenter={jest.fn()} onClose={jest.fn()} onZoomIn={jest.fn()} onZoomOut={onZoomOut} />);

    fireEvent.press(screen.getByTestId('deep-space-object-zoom-out-btn'));
    expect(onZoomOut).toHaveBeenCalledWith(MOCK_STAR);
  });

  it('announces when the object is added to or removed from favorites', () => {
    render(<ObjectInfoSheet object={MOCK_STAR} onCenter={jest.fn()} onClose={jest.fn()} onZoomIn={jest.fn()} />);

    const likeBtn = screen.getByTestId('deep-space-object-like-btn');
    fireEvent.press(likeBtn);
    expect(showDeepSpaceFeedback).toHaveBeenLastCalledWith({ message: '已收藏天狼星', tone: 'success' });

    fireEvent.press(likeBtn);
    expect(showDeepSpaceFeedback).toHaveBeenLastCalledWith({ message: '已取消收藏天狼星', tone: 'success' });
  });
});
