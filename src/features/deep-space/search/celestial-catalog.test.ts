import { describe, expect, it } from '@jest/globals';
import {
  ALL_CELESTIAL_OBJECTS,
  BRIGHT_STARS,
  CONSTELLATIONS,
  DEEP_SKY_OBJECTS,
  SATELLITE_OBJECTS,
  searchCelestialObjects,
  SOLAR_SYSTEM_OBJECTS,
} from './celestial-catalog';

describe('celestialCatalog data integrity', () => {
  it('contains entries across all 5 categories', () => {
    expect(SOLAR_SYSTEM_OBJECTS.length).toBeGreaterThanOrEqual(8);
    expect(BRIGHT_STARS.length).toBeGreaterThanOrEqual(50);
    expect(DEEP_SKY_OBJECTS.length).toBeGreaterThanOrEqual(120);
    expect(SATELLITE_OBJECTS.length).toBeGreaterThanOrEqual(8);
    expect(CONSTELLATIONS.length).toBe(88);
    expect(ALL_CELESTIAL_OBJECTS.length).toBe(
      SOLAR_SYSTEM_OBJECTS.length + BRIGHT_STARS.length + DEEP_SKY_OBJECTS.length + CONSTELLATIONS.length + SATELLITE_OBJECTS.length,
    );
  });

  it('every entry has non-empty id, nameZh, and nameEn', () => {
    for (const item of ALL_CELESTIAL_OBJECTS) {
      expect(item.id).toBeTruthy();
      expect(item.nameZh).toBeTruthy();
      expect(item.nameEn).toBeTruthy();
      expect(item.typeZh).toBeTruthy();
      expect(item.typeEn).toBeTruthy();
    }
  });
});

describe('offline catalog completeness and identifiers', () => {
  it('contains every Messier number exactly once, including exceptional objects', () => {
    for (let number = 1; number <= 110; number++) {
      expect(DEEP_SKY_OBJECTS.filter(item => item.id === `M ${number}`)).toHaveLength(1);
      expect(searchCelestialObjects(`M ${number}`, 'dso')[0]?.id).toBe(`M ${number}`);
    }
    expect(searchCelestialObjects('M40')[0]?.typeEn).toMatch(/double|binary/i);
    expect(searchCelestialObjects('M73')[0]?.typeEn).toMatch(/asterism/i);
    expect(searchCelestialObjects('M102')[0]?.designation).toContain('NGC 5866');
  });

  it('has unique normalized ids rather than emitting alternate catalog ids twice', () => {
    const ids = ALL_CELESTIAL_OBJECTS.map(item => item.id.normalize('NFKC').toLowerCase().replace(/\s+/g, ''));
    expect(new Set(ids).size).toBe(ids.length);
    expect(searchCelestialObjects('NGC 1976').filter(item => item.id === 'M 42')).toHaveLength(1);
    expect(ALL_CELESTIAL_OBJECTS.some(item => item.id === 'NGC 1976')).toBe(false);
  });

  it.each(['Io', 'Europa', 'Ganymede', 'Callisto', 'Titan'])('includes the engine moon %s in satellites', (name) => {
    expect(searchCelestialObjects(name, 'satellites')[0]).toMatchObject({ id: `NAME ${name}`, category: 'satellites' });
  });

  it.each(['ISS', 'CSS', '国际空间站', '中国空间站', '木卫一', '土卫六'])('searches satellite name %s in the same bilingual catalog', (query) => {
    const results = searchCelestialObjects(query, 'satellites');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(item => item.category === 'satellites')).toBe(true);
  });

  it('includes bundled comets without inventing unbundled contemporary objects', () => {
    expect(searchCelestialObjects('Hale-Bopp', 'satellites')[0]?.typeEn).toBe('Comet');
    expect(searchCelestialObjects('哈雷', 'satellites')[0]?.nameEn).toContain('Halley');
    expect(searchCelestialObjects('3I/ATLAS', 'satellites')).toEqual([]);
  });

  it('does not expose static solar-system or satellite magnitude as current brightness', () => {
    expect([...SOLAR_SYSTEM_OBJECTS, ...SATELLITE_OBJECTS].every(item => item.vmag === undefined)).toBe(true);
  });
});

describe('search normalization and pinyin', () => {
  it.each([
    ['muxing', 'NAME Jupiter'],
    ['mx', 'NAME Jupiter'],
    ['ＭＵＸＩＮＧ', 'NAME Jupiter'],
    ['liehu', 'CON western Ori'],
    ['lh', 'CON western Ori'],
    ['xiannv', 'CON western And'],
    ['xn', 'CON western And'],
    ['xiannü', 'CON western And'],
    ['zhinvxing', 'Vega'],
    ['shensusi', 'Betelgeuse'],
    ['shensuqi', 'Rigel'],
    ['wuch eer', 'Capella'],
    ['changshe', 'CON western Hya'],
    ['houfa', 'CON western Com'],
    ['tiancheng', 'CON western Lib'],
    ['changgengxing', 'NAME Venus'],
    ['Ｍ　４２', 'M 42'],
    ['M 0042', 'M 42'],
    ['ｎｇｃ　７０００', 'NGC 7000'],
    ['HP91262', 'Vega'],
    ['hip 91262', 'Vega'],
    ['HIP　９１２６２', 'Vega'],
    ['α Lyr', 'Vega'],
    ['ALPHA LYR', 'Vega'],
    ['Alpha Lyrae', 'Vega'],
    ['β Ori', 'Rigel'],
    ['BETA ORI', 'Rigel'],
    ['Boötes', 'CON western Boo'],
  ])('normalizes %s to %s', (query, expectedId) => {
    expect(searchCelestialObjects(query)[0]?.id).toBe(expectedId);
  });

  it('ranks exact catalog aliases above popular or brighter numbered prefixes', () => {
    expect(searchCelestialObjects('M1')[0]?.id).toBe('M 1');
    expect(searchCelestialObjects('M10')[0]?.id).toBe('M 10');
    expect(searchCelestialObjects('NGC 224')[0]?.id).toBe('M 31');
    expect(searchCelestialObjects('NGC 2244')[0]?.id).not.toBe('M 31');
  });

  it.each([0, -1, Number.NaN])('returns no results for invalid or empty limit %s', (limit) => {
    expect(searchCelestialObjects('m', 'all', limit)).toEqual([]);
    expect(searchCelestialObjects('', 'all', limit)).toEqual([]);
  });

  it('applies category and limit after ranking without leaking other categories', () => {
    expect(searchCelestialObjects('liehu', 'dso')[0]?.id).toBe('M 42');
    expect(searchCelestialObjects('m', 'dso', 2)).toHaveLength(2);
    expect(searchCelestialObjects('not-a-real-celestial-object')).toEqual([]);
    expect(searchCelestialObjects('   ')).toEqual(searchCelestialObjects(''));
  });
});

describe('searchCelestialObjects basic and Chinese', () => {
  it('returns popular curated objects when query is empty', () => {
    const results = searchCelestialObjects('');
    expect(results.length).toBeGreaterThan(5);
    expect(results.every(r => r.popular)).toBe(true);
    expect(results.some(r => r.nameZh.includes('火星'))).toBe(true);
    expect(results.some(r => r.nameZh.includes('织女'))).toBe(true);
  });

  describe('Chinese keyword search', () => {
    it('finds Vega by "织女" or "织女星"', () => {
      const results = searchCelestialObjects('织女');
      expect(results[0].id).toBe('Vega');
      expect(results[0].nameEn).toBe('Vega');
    });

    it('finds Mars by "火星"', () => {
      const results = searchCelestialObjects('火星');
      expect(results[0].id).toBe('NAME Mars');
      expect(results[0].category).toBe('solar_system');
    });

    it('finds Polaris by "北极星" or "勾陈一"', () => {
      const resultsByCommon = searchCelestialObjects('北极星');
      expect(resultsByCommon[0].id).toBe('Polaris');

      const resultsByAlias = searchCelestialObjects('勾陈一');
      expect(resultsByAlias.some(r => r.id === 'Polaris')).toBe(true);
    });

    it('finds Orion Nebula by "猎户座大星云" or "猎户"', () => {
      const results = searchCelestialObjects('猎户座大星云');
      expect(results[0].id).toBe('M 42');
    });

    it('finds Altair by "牛郎" or "河鼓二"', () => {
      const results1 = searchCelestialObjects('牛郎');
      expect(results1[0].id).toBe('Altair');

      const results2 = searchCelestialObjects('河鼓二');
      expect(results2[0].id).toBe('Altair');
    });

    it('finds Big Dipper components by "北斗"', () => {
      const results = searchCelestialObjects('北斗');
      expect(results.length).toBeGreaterThanOrEqual(4);
      expect(results.some(r => r.nameZh.includes('天枢'))).toBe(true);
    });
  });
});

describe('searchCelestialObjects English, catalog and filtering', () => {
  describe('English keyword search', () => {
    it('finds Vega by "vega" case-insensitively', () => {
      const results = searchCelestialObjects('vega');
      expect(results[0].id).toBe('Vega');
    });

    it('finds Sirius by "sirius"', () => {
      const results = searchCelestialObjects('sirius');
      expect(results[0].id).toBe('Sirius');
    });

    it('finds Andromeda Galaxy by "andromeda"', () => {
      const results = searchCelestialObjects('andromeda');
      expect(results.some(r => r.id === 'M 31')).toBe(true);
      expect(results.some(r => r.id === 'CON western And')).toBe(true);
    });
  });

  describe('Catalog identifier normalization', () => {
    it('matches "m42" and "M42" to M 42', () => {
      const resultsLower = searchCelestialObjects('m42');
      expect(resultsLower[0].id).toBe('M 42');

      const resultsUpper = searchCelestialObjects('M42');
      expect(resultsUpper[0].id).toBe('M 42');
    });

    it('matches "ngc7000" and "NGC 7000" to NGC 7000', () => {
      const results = searchCelestialObjects('ngc7000');
      expect(results[0].id).toBe('NGC 7000');
    });

    it('matches "m31" to Andromeda Galaxy', () => {
      const results = searchCelestialObjects('m31');
      expect(results[0].id).toBe('M 31');
    });
  });

  describe('Category filtering', () => {
    it('filters strictly by solar_system', () => {
      const results = searchCelestialObjects('', 'solar_system');
      expect(results.every(r => r.category === 'solar_system')).toBe(true);
    });

    it('filters strictly by stars', () => {
      const results = searchCelestialObjects('a', 'stars');
      expect(results.every(r => r.category === 'stars')).toBe(true);
    });

    it('filters strictly by dso', () => {
      const results = searchCelestialObjects('星云', 'dso');
      expect(results.every(r => r.category === 'dso')).toBe(true);
    });

    it('filters strictly by constellation', () => {
      const results = searchCelestialObjects('座', 'constellation');
      expect(results.every(r => r.category === 'constellation')).toBe(true);
    });
  });

  describe('Ranking and priority', () => {
    it('ranks exact match higher than partial matches', () => {
      const results = searchCelestialObjects('Sun');
      expect(results[0].id).toBe('NAME Sun');
    });

    it('ranks Mars higher than other partial matches for "Mars"', () => {
      const results = searchCelestialObjects('Mars');
      expect(results[0].id).toBe('NAME Mars');
    });
  });
});
