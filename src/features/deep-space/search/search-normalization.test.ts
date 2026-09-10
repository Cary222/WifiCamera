import { searchCelestialObjects } from './celestial-catalog';

describe('stellarium search semantics: letter query ranking', () => {
  it('places solar system objects first (Sun, Saturn), followed by stars like Sirius for letter "s"', () => {
    const results = searchCelestialObjects('s', 'all', 100);

    const sunIndex = results.findIndex(i => i.id === 'NAME Sun');
    const saturnIndex = results.findIndex(i => i.id === 'NAME Saturn');
    const siriusIndex = results.findIndex(i => i.id === 'Sirius');

    expect(sunIndex).toBeGreaterThanOrEqual(0);
    expect(saturnIndex).toBeGreaterThanOrEqual(0);
    expect(siriusIndex).toBeGreaterThanOrEqual(0);

    // 太阳系组在最前：NAME Sun 和 NAME Saturn 必须依次在 Sirius（恒星）之前
    expect(sunIndex).toBeLessThan(saturnIndex);
    expect(saturnIndex).toBeLessThan(siriusIndex);

    // 所有在 Sirius 前面的项目分类必须是 solar_system
    const itemsBeforeSirius = results.slice(0, siriusIndex);
    expect(itemsBeforeSirius.every(item => item.category === 'solar_system')).toBe(true);
  });

  it('ranks solar-system bodies above catalogued stars when their primary name matches the prefix', () => {
    const results = searchCelestialObjects('j', 'all', 100);
    expect(results[0]?.id).toBe('NAME Jupiter');
  });
});

describe('stellarium search semantics: catalog code normalization', () => {
  it.each(['M 42', 'm42', 'M042', 'm 42', 'M 0042', 'm0042'])(
    'matches %s directly to M 42 and ranks it at the top',
    (query) => {
      const results = searchCelestialObjects(query, 'all', 10);
      expect(results[0]?.id).toBe('M 42');
    },
  );

  it.each(['NGC 7000', 'ngc7000', 'NGC07000', 'ngc 7000'])(
    'matches %s to NGC 7000 at the top',
    (query) => {
      const results = searchCelestialObjects(query, 'all', 10);
      expect(results[0]?.id).toBe('NGC 7000');
    },
  );

  it.each(['IC 434', 'ic434', 'IC0434'])(
    'matches %s to IC 434 (Horsehead Nebula) at the top',
    (query) => {
      const results = searchCelestialObjects(query, 'all', 10);
      expect(results[0]?.id).toBe('IC 434');
    },
  );

  it.each(['C 49', 'Caldwell 49', 'c49', 'c 49'])(
    'matches %s to Rosette Nebula (Caldwell 49 / NGC 2244) at the top',
    (query) => {
      const results = searchCelestialObjects(query, 'all', 10);
      expect(results[0]?.id).toBe('NGC 2244');
    },
  );
});

describe('stellarium search semantics: substring/match-anywhere Chinese search', () => {
  it('matches Vega (织女一) via single character "织" and ranks at the top of stars', () => {
    const results = searchCelestialObjects('织', 'all', 10);
    expect(results[0]?.id).toBe('Vega');
    expect(results[0]?.nameZh).toContain('织女');
  });

  it('matches both M 31 and Andromeda constellation via "仙女"', () => {
    const results = searchCelestialObjects('仙女', 'all', 10);
    const m31 = results.find(i => i.id === 'M 31');
    const andCon = results.find(i => i.id === 'CON western And');

    expect(m31).toBeDefined();
    expect(andCon).toBeDefined();
  });
});

describe('stellarium search semantics: HIP / HP exact number matching (StarMgr.cpp)', () => {
  it.each([
    'HIP 91262',
    'HP 91262',
    'hip 91262',
    'hip91262',
    'HP091262',
    'HIP 91262 A', // Stellarium 源码: The final part (A/B/...) is ignored
    'HIP 91262/B',
  ])('matches %s to Vega by exact HP number', (query) => {
    const results = searchCelestialObjects(query, 'all', 10);
    expect(results[0]?.id).toBe('Vega');
  });

  it.each(['HIP 32349', 'HP 32349', 'hip32349'])(
    'matches %s to Sirius by exact HP number',
    (query) => {
      const results = searchCelestialObjects(query, 'all', 10);
      expect(results[0]?.id).toBe('Sirius');
    },
  );

  it('returns empty when HIP number does not exist in catalog', () => {
    const results = searchCelestialObjects('HIP 9999999', 'all', 10);
    expect(results).toEqual([]);
  });
});

describe('stellarium search semantics: module ordering & category preservation', () => {
  it('maintains strict module grouping: solar_system > stars > dso > constellation > satellites', () => {
    // 搜索包含字母 'a' 的对象，通常跨所有模块
    const results = searchCelestialObjects('a', 'all', 100);
    const categoryOrderMap: Record<string, number> = {
      solar_system: 0,
      stars: 1,
      dso: 2,
      constellation: 3,
      satellites: 4,
    };

    let lastRank = 0;
    for (const item of results) {
      const currentRank = categoryOrderMap[item.category];
      expect(currentRank).toBeGreaterThanOrEqual(lastRank);
      lastRank = currentRank;
    }
  });

  it('does not alter grouping based on star brightness or popular flags', () => {
    // 恒星天狼星视星等为 -1.46 (极亮且 popular)，但绝不能因亮度加权排到太阳系天体前面
    const results = searchCelestialObjects('s', 'all', 30);
    const firstStarIndex = results.findIndex(r => r.category === 'stars');
    const solarItems = results.filter(r => r.category === 'solar_system');

    expect(solarItems.length).toBeGreaterThan(0);
    expect(firstStarIndex).toBeGreaterThanOrEqual(solarItems.length);
  });
});
