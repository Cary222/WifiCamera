/**
 * Hardcoded mock album data — replace with real camera API once
 * the camera device is reachable from the network.
 */
import type { AlbumData } from './types';

export const MOCK_ALBUM_DATA: AlbumData = {
  storage: {
    name: 'album.storage_card.name',
    usedGB: 15.4,
    totalGB: 32,
  },
  groups: [
    {
      id: 'g-2026-05-22',
      dateLabel: '2026年5月22日',
      items: [
        {
          id: 'p-001',
          target: 'M33',
          exposure: '30S',
          gain: 'Gain 130',
          badge: '120',
          timestamp: '2026-05-22 22:35',
        },
        {
          id: 'p-002',
          target: 'M33',
          exposure: '30S',
          gain: 'Gain 130',
          badge: '120',
          timestamp: '2026-05-22 22:35',
        },
        {
          id: 'p-003',
          target: 'M33',
          exposure: '30S',
          gain: 'Gain 130',
          badge: '120',
          timestamp: '2026-05-22 22:35',
        },
        {
          id: 'p-004',
          target: 'M33',
          exposure: '30S',
          gain: 'Gain 130',
          badge: '120',
          timestamp: '2026-05-22 22:35',
        },
        {
          id: 'p-005',
          target: 'M33',
          exposure: '30S',
          gain: 'Gain 130',
          badge: '120',
          timestamp: '2026-05-22 22:35',
        },
      ],
    },
    {
      id: 'g-2026-05-21',
      dateLabel: '2026年5月21日',
      items: [
        {
          id: 'p-101',
          target: 'M33',
          exposure: '30S',
          gain: 'Gain 130',
          badge: '120',
          timestamp: '2026-05-21 22:10',
        },
        {
          id: 'p-102',
          target: 'M33',
          exposure: '30S',
          gain: 'Gain 130',
          badge: '120',
          timestamp: '2026-05-21 22:10',
        },
        {
          id: 'p-103',
          target: 'M33',
          exposure: '30S',
          gain: 'Gain 130',
          badge: '120',
          timestamp: '2026-05-21 22:10',
        },
      ],
    },
    {
      id: 'g-2026-05-20',
      dateLabel: '2026年5月20日',
      items: [
        {
          id: 'p-201',
          target: 'M33',
          exposure: '30S',
          gain: 'Gain 130',
          badge: '120',
          timestamp: '2026-05-20 21:42',
        },
        {
          id: 'p-202',
          target: 'M33',
          exposure: '30S',
          gain: 'Gain 130',
          badge: '120',
          timestamp: '2026-05-20 21:42',
        },
      ],
    },
  ],
};
