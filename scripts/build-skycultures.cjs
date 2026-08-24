// 从 assets/data/skycultures 与 i18n/skycultures-zh_Hans.qm 提取完整的 33 个天空文化数据
const fs = require('fs');
const path = require('path');
const { parseQm } = require('../tmp/qm.cjs');

const ROOT = path.resolve(__dirname, '..');
const SKY_DIR = path.join(ROOT, 'src/assets/stellar/data/skycultures');
const QM_FILE = path.join(ROOT, 'src/assets/stellar/data/i18n/skycultures-zh_Hans.qm');
const OUT_JSON = path.join(ROOT, 'src/assets/stellar/skycultures.json');
const OUT_CULTURES_JSON = path.join(ROOT, 'src/assets/stellar/skycultures-full.json');

const REGION_ORDER = ['Middle East', 'Asia', 'Europe', 'America', 'Oceania'];
const REGIONS_ZH = {
  'Middle East': '中东',
  'Asia': '亚洲',
  'Europe': '欧洲',
  'America': '美洲',
  'Oceania': '大洋洲',
};

const DEFAULT_REGIONS = {
  'arabic_al-sufi': 'Middle East',
  'arabic_ancient': 'Middle East',
  'arabic_lunar_stations': 'Middle East',
  'egyptian': 'Middle East',
  'bugis': 'Asia',
  'chinese': 'Asia',
  'chinese_contemporary': 'Asia',
  'indian': 'Asia',
  'japanese_moon_stations': 'Asia',
  'korean': 'Asia',
  'mandar': 'Asia',
  'mongolian': 'Asia',
  'siberian': 'Asia',
  'belarusian': 'Europe',
  'norse': 'Europe',
  'romanian': 'Europe',
  'ruelle': 'Europe',
  'sami': 'Europe',
  'sardinian': 'Europe',
  'western': 'Europe',
  'western_hlad': 'Europe',
  'western_rey': 'Europe',
  'western_SnT': 'Europe',
  'blackfoot': 'America',
  'inuit': 'America',
  'navajo': 'America',
  'tukano': 'America',
  'tupi': 'America',
  'anutan': 'Oceania',
  'hawaiian_starlines': 'Oceania',
  'kamilaroi': 'Oceania',
  'maori': 'Oceania',
  'tongan': 'Oceania',
};

const rawTranslations = parseQm(QM_FILE);
const exactMap = new Map();
const lowerMap = new Map();

for (const row of rawTranslations) {
  if (row.source && row.translation) {
    const src = Buffer.from(row.source, 'latin1').toString('utf8').trim();
    const trans = row.translation.trim();
    exactMap.set(src, trans);
    lowerMap.set(src.toLowerCase(), trans);
  }
}

function translateText(text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (exactMap.has(trimmed)) return exactMap.get(trimmed);
  if (lowerMap.has(trimmed.toLowerCase())) return lowerMap.get(trimmed.toLowerCase());
  const stripped = trimmed.replace(/\r?\n+/g, ' ');
  for (const [k, v] of exactMap.entries()) {
    if (k.replace(/\r?\n+/g, ' ') === stripped) return v;
  }
  return null;
}

const entries = fs.readdirSync(SKY_DIR, { withFileTypes: true });
const cultureIds = entries.filter(e => e.isDirectory() && e.name !== 'i18n').map(e => e.name);

const cultures = [];
for (const id of cultureIds) {
  const dir = path.join(SKY_DIR, id);
  const metaPath = path.join(dir, 'index.json');
  if (!fs.existsSync(metaPath)) continue;

  let meta = {};
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch (err) {
    console.warn(`[warn] parse failed ${metaPath}:`, err.message);
  }

  const descPath = path.join(dir, 'description.md');
  const descMd = fs.existsSync(descPath) ? fs.readFileSync(descPath, 'utf8') : '';

  // 1. Title
  let titleRaw = meta.title || '';
  if (!titleRaw && descMd) {
    const hm = descMd.match(/^#\s+(.*)$/m);
    if (hm) titleRaw = hm[1].trim();
  }
  if (!titleRaw) {
    titleRaw = id;
  }
  const titleZh = translateText(titleRaw) || titleRaw;

  // 2. Region
  const region = meta.region || DEFAULT_REGIONS[id] || 'Europe';

  // 3. Intro
  let intro = meta.intro || '';
  if (!intro && descMd) {
    const m = descMd.match(/##\s+Introduction\s*\n+([\s\S]*?)(?=\n##|$)/);
    if (m) intro = m[1].trim();
  }
  const introZh = translateText(intro);

  // 4. Thumbnail
  let thumbnail = meta.thumbnail || null;
  if (!thumbnail) {
    const files = fs.readdirSync(dir);
    const topWebp = files.find(f => f.endsWith('.webp'));
    if (topWebp) thumbnail = topWebp;
    else if (fs.existsSync(path.join(dir, 'illustrations'))) {
      const illFiles = fs.readdirSync(path.join(dir, 'illustrations')).filter(f => f.endsWith('.webp'));
      if (illFiles.length > 0) thumbnail = `illustrations/${illFiles[0]}`;
    }
  }

  const sections = parseDescription(descMd, id);
  // Some cultures do not declare a featured object; their first constellation is
  // still a stable, culture-specific target for the in-app "use" action.
  const highlight = meta.highlight || meta.constellations?.[0]?.id || null;

  cultures.push({
    id,
    highlight,
    region,
    title: titleRaw,
    titleZh,
    intro,
    introZh,
    thumbnail,
    classification: meta.classification || null,
    license: meta.license || null,
    source: meta.source || null,
    sections,
  });
}

function parseDescription(md, cultureId) {
  if (!md) return [];
  const lines = md.split(/\r?\n/);
  const sections = [];
  let currentSection = { heading: '', headingZh: '', blocks: [] };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const hm = line.match(/^(#{2,3})\s+(.*)$/);
    if (hm) {
      if (currentSection.blocks.length > 0 || currentSection.heading) {
        sections.push(currentSection);
      }
      const heading = hm[2].trim();
      currentSection = {
        heading,
        headingZh: translateText(heading) || heading,
        blocks: [],
      };
      i++;
      continue;
    }

    const imgMatch = line.match(/^!\[(.*?)\]\((.*?)\)/);
    if (imgMatch) {
      const imagePath = imgMatch[2];
      let caption = '';
      i++;
      if (i < lines.length && !lines[i].startsWith('{:') && !lines[i].startsWith('#') && lines[i].trim().length > 0) {
        caption = lines[i].trim();
        i++;
      }
      if (i < lines.length && lines[i].startsWith('{:')) {
        i++;
      }
      currentSection.blocks.push({
        type: 'image',
        image: imagePath,
        alt: imgMatch[1] || '',
        caption,
        captionZh: translateText(caption) || caption,
      });
      continue;
    }

    if (line.trim().length > 0) {
      let para = line;
      i++;
      while (i < lines.length && lines[i].trim().length > 0 && !lines[i].startsWith('#') && !lines[i].startsWith('![')) {
        para += '\n' + lines[i];
        i++;
      }
      const pTrimmed = para.trim();
      currentSection.blocks.push({
        type: 'paragraph',
        text: pTrimmed,
        textZh: translateText(pTrimmed) || pTrimmed,
      });
      continue;
    }

    i++;
  }
  if (currentSection.blocks.length > 0 || currentSection.heading) {
    sections.push(currentSection);
  }
  return sections;
}

// 稳定排序：按 REGION_ORDER 分组
cultures.sort((a, b) => {
  const ra = REGION_ORDER.indexOf(a.region);
  const rb = REGION_ORDER.indexOf(b.region);
  if (ra !== rb) return ra - rb;
  return a.id.localeCompare(b.id);
});

const compactData = {
  regionsZh: REGIONS_ZH,
  regionOrder: REGION_ORDER,
  cultures: cultures.map(c => ({
    id: c.id,
    region: c.region,
    title: c.title,
    titleZh: c.titleZh,
    intro: c.intro,
    introZh: c.introZh,
    thumbnail: c.thumbnail,
  })),
};
fs.writeFileSync(OUT_JSON, JSON.stringify(compactData, null, 2), 'utf8');

const fullData = {
  regionsZh: REGIONS_ZH,
  regionOrder: REGION_ORDER,
  cultures,
};
fs.writeFileSync(OUT_CULTURES_JSON, JSON.stringify(fullData, null, 2), 'utf8');

console.log(`✓ 成功生成:`);
console.log(`  - 紧凑版: ${OUT_JSON} (${cultures.length} cultures)`);
console.log(`  - 完整版: ${OUT_CULTURES_JSON} (${(fs.statSync(OUT_CULTURES_JSON).size / 1024).toFixed(1)} KB)`);
