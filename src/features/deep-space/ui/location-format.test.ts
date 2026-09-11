import i18n from '@/lib/i18n';
import { cityLabel, formatLatitudeDMS, formatLongitudeDMS } from './location-format';

describe('star-map location formatting', () => {
  afterAll(async () => {
    await i18n.changeLanguage('zh');
  });

  it('localizes canonical city names and passes free-form names through', async () => {
    await i18n.changeLanguage('en');
    expect(cityLabel('北京')).toBe('Beijing');
    expect(cityLabel('当前位置')).toBe('Current location');
    // A reverse-geocoded or user-typed name has no key and must survive untouched.
    expect(cityLabel('My backyard')).toBe('My backyard');
  });

  it('honours an explicit language for the DMS hemispheres', () => {
    expect(formatLatitudeDMS(39.9042, 'en')).toMatch(/39° 54' \d+" N/);
    expect(formatLatitudeDMS(-33.8688, 'en')).toMatch(/33° 52' \d+" S/);
    expect(formatLongitudeDMS(116.4074, 'en')).toMatch(/116° 24' \d+" E/);
    expect(formatLongitudeDMS(-122.4194, 'en')).toMatch(/122° 25' \d+" W/);
  });
});
