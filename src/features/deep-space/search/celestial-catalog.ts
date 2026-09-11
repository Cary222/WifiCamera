import { BRIGHT_STARS } from './bright-stars-data';
import { MESSIER_OBJECTS } from './messier-data';
import { SATELLITE_OBJECTS } from './satellites-data';
import { evaluateCelestialItemMatch, parseStellariumQuery } from './search-normalization';

export type CelestialCategory = 'solar_system' | 'stars' | 'dso' | 'constellation' | 'satellites';

export type CelestialSearchCategory = 'all' | CelestialCategory;

export type CelestialSearchItem = {
  /** Stable catalog identity; the bridge resolves native engineIds and aliases without renaming saved items. */
  id: string;
  nameZh: string;
  nameEn: string;
  category: CelestialCategory;
  typeZh: string;
  typeEn: string;
  aliases?: string[];
  /** Verified designations accepted by the bundled native engine. */
  engineIds?: string[];
  vmag?: number;
  constellationZh?: string;
  constellationEn?: string;
  designation?: string;
  popular?: boolean;
  raDeg?: number;
  decDeg?: number;
  fovDeg?: number;
};

// -----------------------------------------------------------------------------
// 1. Solar System Planets & Major Bodies (No static live vmag)
// -----------------------------------------------------------------------------
export const SOLAR_SYSTEM_OBJECTS: CelestialSearchItem[] = [
  {
    aliases: ['日', 'Sun', '太阳', 'taiyang', 'ty'],
    category: 'solar_system',
    id: 'NAME Sun',
    nameEn: 'Sun',
    nameZh: '太阳',
    popular: true,
    typeEn: 'Star',
    typeZh: '恒星',
  },
  {
    aliases: ['月', '月球', 'Moon', '太阴', '月亮', 'yueliang', 'yl', 'yueqiu', 'yq'],
    category: 'solar_system',
    id: 'NAME Moon',
    nameEn: 'Moon',
    nameZh: '月亮',
    popular: true,
    typeEn: 'Satellite',
    typeZh: '天然卫星',
  },
  {
    aliases: ['水星', 'Mercury', '辰星', 'shuixing', 'sx'],
    category: 'solar_system',
    id: 'NAME Mercury',
    nameEn: 'Mercury',
    nameZh: '水星',
    popular: true,
    typeEn: 'Planet',
    typeZh: '行星',
  },
  {
    aliases: ['金星', 'Venus', '太白', '启明星', '长庚星', 'jinxing', 'jx', 'changgengxing', 'cgx', 'taibai', 'tb'],
    category: 'solar_system',
    id: 'NAME Venus',
    nameEn: 'Venus',
    nameZh: '金星',
    popular: true,
    typeEn: 'Planet',
    typeZh: '行星',
  },
  {
    aliases: ['火星', 'Mars', '荧惑', 'huoxing', 'hx'],
    category: 'solar_system',
    id: 'NAME Mars',
    nameEn: 'Mars',
    nameZh: '火星',
    popular: true,
    typeEn: 'Planet',
    typeZh: '行星',
  },
  {
    aliases: ['木星', 'Jupiter', '岁星', 'muxing', 'mx', 'suixing', 'sx'],
    category: 'solar_system',
    id: 'NAME Jupiter',
    nameEn: 'Jupiter',
    nameZh: '木星',
    popular: true,
    typeEn: 'Planet',
    typeZh: '行星',
  },
  {
    aliases: ['土星', 'Saturn', '镇星', '填星', 'tuxing', 'tx'],
    category: 'solar_system',
    id: 'NAME Saturn',
    nameEn: 'Saturn',
    nameZh: '土星',
    popular: true,
    typeEn: 'Planet',
    typeZh: '行星',
  },
  {
    aliases: ['天王星', 'Uranus', 'tianwangxing', 'twx'],
    category: 'solar_system',
    id: 'NAME Uranus',
    nameEn: 'Uranus',
    nameZh: '天王星',
    typeEn: 'Planet',
    typeZh: '行星',
  },
  {
    aliases: ['海王星', 'Neptune', 'haiwangxing', 'hwx'],
    category: 'solar_system',
    id: 'NAME Neptune',
    nameEn: 'Neptune',
    nameZh: '海王星',
    typeEn: 'Planet',
    typeZh: '行星',
  },
  {
    aliases: ['冥王星', 'Pluto', 'mingwangxing', 'mwx'],
    category: 'solar_system',
    id: 'NAME Pluto',
    nameEn: 'Pluto',
    nameZh: '冥王星',
    typeEn: 'Dwarf Planet',
    typeZh: '矮行星',
  },
];

// -----------------------------------------------------------------------------
// 2. Notable Bright Stars & Landmarks (Exported from bright-stars-data)
// -----------------------------------------------------------------------------
export { BRIGHT_STARS } from './bright-stars-data';

// -----------------------------------------------------------------------------
// 3. Deep-Sky Objects (Messier M1-M110 + Notable Non-Messier NGC/IC)
// -----------------------------------------------------------------------------
const NOTABLE_NON_MESSIER_DSO: CelestialSearchItem[] = [
  {
    aliases: ['北美洲星云', 'North America Nebula', 'NGC7000', 'ngc7000', 'beimeizhouxingyun', 'bmzxy'],
    category: 'dso',
    constellationEn: 'Cygnus',
    constellationZh: '天鹅座',
    designation: 'NGC 7000',
    id: 'NGC 7000',
    nameEn: 'North America Nebula',
    nameZh: '北美洲星云 (NGC 7000)',
    popular: true,
    typeEn: 'Emission Nebula',
    typeZh: '发射星云',
    vmag: 4.0,
  },
  {
    aliases: ['玫瑰星云', 'Rosette Nebula', 'NGC 2237', 'NGC 2244', 'Caldwell 49', 'meiguixingyun', 'mgxy'],
    category: 'dso',
    constellationEn: 'Monoceros',
    constellationZh: '麒麟座',
    designation: 'NGC 2244 / Caldwell 49',
    id: 'NGC 2244',
    nameEn: 'Rosette Nebula',
    nameZh: '玫瑰星云 (NGC 2244)',
    popular: true,
    typeEn: 'Emission Nebula',
    typeZh: '发射星云',
    vmag: 4.8,
  },
  {
    aliases: ['马头星云', 'Horsehead Nebula', 'Barnard 33', 'B33', 'IC434', 'matouxingyun', 'mtxy'],
    category: 'dso',
    constellationEn: 'Orion',
    constellationZh: '猎户座',
    designation: 'IC 434 / Barnard 33',
    id: 'IC 434',
    nameEn: 'Horsehead Nebula (IC 434)',
    nameZh: '马头星云 (IC 434)',
    popular: true,
    typeEn: 'Dark Nebula',
    typeZh: '暗星云',
    vmag: 7.3,
  },
  {
    aliases: ['双星团', '英仙座双星团', 'Double Cluster', 'NGC 869', 'NGC 884'],
    category: 'dso',
    constellationEn: 'Perseus',
    constellationZh: '英仙座',
    designation: 'NGC 869 / NGC 884',
    id: 'NGC 869',
    nameEn: 'Double Cluster (NGC 869/884)',
    nameZh: '英仙座双星团',
    typeEn: 'Open Cluster',
    typeZh: '疏散星团',
    vmag: 3.7,
  },
  {
    aliases: ['螺旋星云', '上帝之眼', 'Helix Nebula', 'NGC 7293', 'Caldwell 63', 'luoxuanxingyun', 'lxxy'],
    category: 'dso',
    constellationEn: 'Aquarius',
    constellationZh: '宝瓶座',
    designation: 'NGC 7293',
    id: 'NGC 7293',
    nameEn: 'Helix Nebula (NGC 7293)',
    nameZh: '螺旋星云 (上帝之眼)',
    popular: true,
    typeEn: 'Planetary Nebula',
    typeZh: '行星状星云',
    vmag: 7.6,
  },
  {
    aliases: ['面纱星云', 'Veil Nebula', '天鹅座圈', 'Cygnus Loop', 'NGC 6960', 'NGC 6992', 'mianshaixingyun'],
    category: 'dso',
    constellationEn: 'Cygnus',
    constellationZh: '天鹅座',
    designation: 'NGC 6960 / 6992',
    id: 'NGC 6960',
    nameEn: 'Veil Nebula (NGC 6960)',
    nameZh: '面纱星云 (NGC 6960)',
    popular: true,
    typeEn: 'Supernova Remnant',
    typeZh: '超新星遗迹',
    vmag: 7.0,
  },
  {
    aliases: ['船底座大星云', 'Carina Nebula', 'NGC 3372', 'Keyhole Nebula', 'chuandizuodaxingyun'],
    category: 'dso',
    constellationEn: 'Carina',
    constellationZh: '船底座',
    designation: 'NGC 3372',
    id: 'NGC 3372',
    nameEn: 'Carina Nebula (NGC 3372)',
    nameZh: '船底座大星云',
    popular: true,
    typeEn: 'Diffuse Nebula',
    typeZh: '弥散星云',
    vmag: 3.0,
  },
  {
    aliases: ['半人马座ω', 'Omega Centauri', 'NGC 5139', 'Caldwell 80'],
    category: 'dso',
    constellationEn: 'Centaurus',
    constellationZh: '半人马座',
    designation: 'NGC 5139',
    id: 'NGC 5139',
    nameEn: 'Omega Centauri (NGC 5139)',
    nameZh: '半人马座ω球状星团',
    typeEn: 'Globular Cluster',
    typeZh: '球状星团',
    vmag: 3.9,
  },
  {
    aliases: ['大麦哲伦星系', '大麦哲伦星云', 'Large Magellanic Cloud', 'LMC', 'damozhelun'],
    category: 'dso',
    constellationEn: 'Dorado',
    constellationZh: '剑鱼座',
    designation: 'LMC',
    id: 'LMC',
    nameEn: 'Large Magellanic Cloud',
    nameZh: '大麦哲伦星系',
    popular: true,
    typeEn: 'Satellite Galaxy',
    typeZh: '卫星星系',
    vmag: 0.9,
  },
  {
    aliases: ['小麦哲伦星系', '小麦哲伦星云', 'Small Magellanic Cloud', 'SMC', 'xiaomozhelun'],
    category: 'dso',
    constellationEn: 'Tucana',
    constellationZh: '杜鹃座',
    designation: 'SMC',
    id: 'SMC',
    nameEn: 'Small Magellanic Cloud',
    nameZh: '小麦哲伦星系',
    popular: true,
    typeEn: 'Satellite Galaxy',
    typeZh: '卫星星系',
    vmag: 2.7,
  },
];

export const DEEP_SKY_OBJECTS: CelestialSearchItem[] = [
  ...MESSIER_OBJECTS,
  ...NOTABLE_NON_MESSIER_DSO,
];

// -----------------------------------------------------------------------------
// 4. 88 Modern Constellations
// -----------------------------------------------------------------------------
export const CONSTELLATIONS: CelestialSearchItem[] = [
  { aliases: ['仙女', 'Andromeda', 'And', 'xiannv', 'xn', 'xiannu', 'xiannü'], category: 'constellation', id: 'CON western And', nameEn: 'Andromeda', nameZh: '仙女座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['唧筒', 'Antlia', 'Ant'], category: 'constellation', id: 'CON western Ant', nameEn: 'Antlia', nameZh: '唧筒座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['天燕', 'Apus', 'Aps'], category: 'constellation', id: 'CON western Aps', nameEn: 'Apus', nameZh: '天燕座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['水瓶', '水瓶座', '宝瓶', 'Aquarius', 'Aqr', 'baoping', 'bp', 'shuiping', 'sp'], category: 'constellation', id: 'CON western Aqr', nameEn: 'Aquarius', nameZh: '宝瓶座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['天鹰', 'Aquila', 'Aql', 'tianying', 'ty'], category: 'constellation', id: 'CON western Aql', nameEn: 'Aquila', nameZh: '天鹰座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['天坛', 'Ara', 'Ara'], category: 'constellation', id: 'CON western Ara', nameEn: 'Ara', nameZh: '天坛座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['白羊', 'Aries', 'Ari', 'baiyang', 'by'], category: 'constellation', id: 'CON western Ari', nameEn: 'Aries', nameZh: '白羊座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['御夫', 'Auriga', 'Aur', 'yufu', 'yf'], category: 'constellation', id: 'CON western Aur', nameEn: 'Auriga', nameZh: '御夫座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['牧夫', 'Bootes', 'Boötes', 'Boo', 'mufu', 'mf'], category: 'constellation', id: 'CON western Boo', nameEn: 'Boötes', nameZh: '牧夫座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['雕具', 'Caelum', 'Cae'], category: 'constellation', id: 'CON western Cae', nameEn: 'Caelum', nameZh: '雕具座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['鹿豹', 'Camelopardalis', 'Cam'], category: 'constellation', id: 'CON western Cam', nameEn: 'Camelopardalis', nameZh: '鹿豹座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['巨蟹', 'Cancer', 'Cnc', 'juxie', 'jx'], category: 'constellation', id: 'CON western Cnc', nameEn: 'Cancer', nameZh: '巨蟹座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['猎犬', 'Canes Venatici', 'CVn', 'liequan', 'lq'], category: 'constellation', id: 'CON western CVn', nameEn: 'Canes Venatici', nameZh: '猎犬座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['大犬', 'Canis Major', 'CMa', 'daquan', 'dq'], category: 'constellation', id: 'CON western CMa', nameEn: 'Canis Major', nameZh: '大犬座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['小犬', 'Canis Minor', 'CMi', 'xiaoquan', 'xq'], category: 'constellation', id: 'CON western CMi', nameEn: 'Canis Minor', nameZh: '小犬座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['摩羯', 'Capricornus', 'Cap', 'mojie', 'mj'], category: 'constellation', id: 'CON western Cap', nameEn: 'Capricornus', nameZh: '摩羯座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['船底', 'Carina', 'Car', 'chuandi', 'cd'], category: 'constellation', id: 'CON western Car', nameEn: 'Carina', nameZh: '船底座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['仙后', '仙后座W', 'Cassiopeia', 'Cas', 'xianhou', 'xh'], category: 'constellation', id: 'CON western Cas', nameEn: 'Cassiopeia', nameZh: '仙后座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['半人马', 'Centaurus', 'Cen', 'banrenma', 'brm'], category: 'constellation', id: 'CON western Cen', nameEn: 'Centaurus', nameZh: '半人马座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['仙王', 'Cepheus', 'Cep', 'xianwang', 'xw'], category: 'constellation', id: 'CON western Cep', nameEn: 'Cepheus', nameZh: '仙王座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['鲸鱼', 'Cetus', 'Cet', 'jingyu', 'jy'], category: 'constellation', id: 'CON western Cet', nameEn: 'Cetus', nameZh: '鲸鱼座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['蝘蜓', 'Chamaeleon', 'Cha'], category: 'constellation', id: 'CON western Cha', nameEn: 'Chamaeleon', nameZh: '蝘蜓座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['圆规', 'Circinus', 'Cir'], category: 'constellation', id: 'CON western Cir', nameEn: 'Circinus', nameZh: '圆规座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['天鸽', 'Columba', 'Col'], category: 'constellation', id: 'CON western Col', nameEn: 'Columba', nameZh: '天鸽座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['后发', 'Coma Berenices', 'Com', 'houfa', 'hf'], category: 'constellation', id: 'CON western Com', nameEn: 'Coma Berenices', nameZh: '后发座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['南冕', 'Corona Australis', 'CrA'], category: 'constellation', id: 'CON western CrA', nameEn: 'Corona Australis', nameZh: '南冕座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['北冕', 'Corona Borealis', 'CrB'], category: 'constellation', id: 'CON western CrB', nameEn: 'Corona Borealis', nameZh: '北冕座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['乌鸦', 'Corvus', 'Crv'], category: 'constellation', id: 'CON western Crv', nameEn: 'Corvus', nameZh: '乌鸦座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['巨爵', 'Crater', 'Crt'], category: 'constellation', id: 'CON western Crt', nameEn: 'Crater', nameZh: '巨爵座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['南十字', 'Crux', 'Cru', 'nanshizi', 'nsz'], category: 'constellation', id: 'CON western Cru', nameEn: 'Crux', nameZh: '南十字座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['天鹅', '北十字', 'Cygnus', 'Cyg', 'tiane', 'te'], category: 'constellation', id: 'CON western Cyg', nameEn: 'Cygnus', nameZh: '天鹅座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['海豚', 'Delphinus', 'Del'], category: 'constellation', id: 'CON western Del', nameEn: 'Delphinus', nameZh: '海豚座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['剑鱼', 'Dorado', 'Dor'], category: 'constellation', id: 'CON western Dor', nameEn: 'Dorado', nameZh: '剑鱼座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['天龙', 'Draco', 'Dra', 'tianlong', 'tl'], category: 'constellation', id: 'CON western Dra', nameEn: 'Draco', nameZh: '天龙座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['小马', 'Equuleus', 'Equ'], category: 'constellation', id: 'CON western Equ', nameEn: 'Equuleus', nameZh: '小马座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['波江', 'Eridanus', 'Eri'], category: 'constellation', id: 'CON western Eri', nameEn: 'Eridanus', nameZh: '波江座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['天炉', 'Fornax', 'For'], category: 'constellation', id: 'CON western For', nameEn: 'Fornax', nameZh: '天炉座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['双子', 'Gemini', 'Gem', 'shuangzi', 'sz'], category: 'constellation', id: 'CON western Gem', nameEn: 'Gemini', nameZh: '双子座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['天鹤', 'Grus', 'Gru'], category: 'constellation', id: 'CON western Gru', nameEn: 'Grus', nameZh: '天鹤座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['武仙', 'Hercules', 'Her', 'wuxian', 'wx'], category: 'constellation', id: 'CON western Her', nameEn: 'Hercules', nameZh: '武仙座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['时钟', 'Horologium', 'Hor'], category: 'constellation', id: 'CON western Hor', nameEn: 'Horologium', nameZh: '时钟座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['长蛇', 'Hydra', 'Hya', 'changshe', 'cs'], category: 'constellation', id: 'CON western Hya', nameEn: 'Hydra', nameZh: '长蛇座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['水蛇', 'Hydrus', 'Hyi'], category: 'constellation', id: 'CON western Hyi', nameEn: 'Hydrus', nameZh: '水蛇座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['印第安', 'Indus', 'Ind'], category: 'constellation', id: 'CON western Ind', nameEn: 'Indus', nameZh: '印第安座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['蝎虎', 'Lacerta', 'Lac'], category: 'constellation', id: 'CON western Lac', nameEn: 'Lacerta', nameZh: '蝎虎座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['狮子', 'Leo', 'Leo', 'shizi', 'sz'], category: 'constellation', id: 'CON western Leo', nameEn: 'Leo', nameZh: '狮子座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['小狮', 'Leo Minor', 'LMi'], category: 'constellation', id: 'CON western LMi', nameEn: 'Leo Minor', nameZh: '小狮座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['天兔', 'Lepus', 'Lep'], category: 'constellation', id: 'CON western Lep', nameEn: 'Lepus', nameZh: '天兔座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['天秤', '天平', 'Libra', 'Lib', 'tiancheng', 'tc', 'tianping', 'tp'], category: 'constellation', id: 'CON western Lib', nameEn: 'Libra', nameZh: '天秤座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['豺狼', 'Lupus', 'Lup'], category: 'constellation', id: 'CON western Lup', nameEn: 'Lupus', nameZh: '豺狼座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['天猫', 'Lynx', 'Lyn'], category: 'constellation', id: 'CON western Lyn', nameEn: 'Lynx', nameZh: '天猫座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['天琴', 'Lyra', 'Lyr', 'tianqin', 'tq'], category: 'constellation', id: 'CON western Lyr', nameEn: 'Lyra', nameZh: '天琴座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['山案', 'Mensa', 'Men'], category: 'constellation', id: 'CON western Men', nameEn: 'Mensa', nameZh: '山案座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['显微镜', 'Microscopium', 'Mic'], category: 'constellation', id: 'CON western Mic', nameEn: 'Microscopium', nameZh: '显微镜座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['麒麟', 'Monoceros', 'Mon'], category: 'constellation', id: 'CON western Mon', nameEn: 'Monoceros', nameZh: '麒麟座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['苍蝇', 'Musca', 'Mus'], category: 'constellation', id: 'CON western Mus', nameEn: 'Musca', nameZh: '苍蝇座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['矩尺', 'Norma', 'Nor'], category: 'constellation', id: 'CON western Nor', nameEn: 'Norma', nameZh: '矩尺座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['南极', 'Octans', 'Oct'], category: 'constellation', id: 'CON western Oct', nameEn: 'Octans', nameZh: '南极座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['蛇夫', 'Ophiuchus', 'Oph', 'shefu', 'sf'], category: 'constellation', id: 'CON western Oph', nameEn: 'Ophiuchus', nameZh: '蛇夫座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['猎户', 'Orion', 'Ori', 'liehu', 'lh'], category: 'constellation', id: 'CON western Ori', nameEn: 'Orion', nameZh: '猎户座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['孔雀', 'Pavo', 'Pav'], category: 'constellation', id: 'CON western Pav', nameEn: 'Pavo', nameZh: '孔雀座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['飞马', '秋季大四边形', 'Pegasus', 'Peg', 'feima', 'fm'], category: 'constellation', id: 'CON western Peg', nameEn: 'Pegasus', nameZh: '飞马座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['英仙', 'Perseus', 'Per', 'yingxian', 'yx'], category: 'constellation', id: 'CON western Per', nameEn: 'Perseus', nameZh: '英仙座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['凤凰', 'Phoenix', 'Phe'], category: 'constellation', id: 'CON western Phe', nameEn: 'Phoenix', nameZh: '凤凰座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['绘架', 'Pictor', 'Pic'], category: 'constellation', id: 'CON western Pic', nameEn: 'Pictor', nameZh: '绘架座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['双鱼', 'Pisces', 'Psc', 'shuangyu', 'sy'], category: 'constellation', id: 'CON western Psc', nameEn: 'Pisces', nameZh: '双鱼座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['南鱼', 'Piscis Austrinus', 'PsA'], category: 'constellation', id: 'CON western PsA', nameEn: 'Piscis Austrinus', nameZh: '南鱼座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['船尾', 'Puppis', 'Pup'], category: 'constellation', id: 'CON western Pup', nameEn: 'Puppis', nameZh: '船尾座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['罗盘', 'Pyxis', 'Pyx'], category: 'constellation', id: 'CON western Pyx', nameEn: 'Pyxis', nameZh: '罗盘座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['网罟', 'Reticulum', 'Ret'], category: 'constellation', id: 'CON western Ret', nameEn: 'Reticulum', nameZh: '网罟座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['天箭', 'Sagitta', 'Sge'], category: 'constellation', id: 'CON western Sge', nameEn: 'Sagitta', nameZh: '天箭座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['射手', '射手座', '人马', 'Sagittarius', 'Sgr', 'renma', 'rm', 'sheshou', 'ss'], category: 'constellation', id: 'CON western Sgr', nameEn: 'Sagittarius', nameZh: '人马座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['天蝎', 'Scorpius', 'Sco', 'tianxie', 'tx'], category: 'constellation', id: 'CON western Sco', nameEn: 'Scorpius', nameZh: '天蝎座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['玉夫', 'Sculptor', 'Scl'], category: 'constellation', id: 'CON western Scl', nameEn: 'Sculptor', nameZh: '玉夫座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['盾牌', 'Scutum', 'Sct'], category: 'constellation', id: 'CON western Sct', nameEn: 'Scutum', nameZh: '盾牌座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['巨蛇', 'Serpens', 'Ser'], category: 'constellation', id: 'CON western Ser', nameEn: 'Serpens', nameZh: '巨蛇座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['六分仪', 'Sextans', 'Sex'], category: 'constellation', id: 'CON western Sex', nameEn: 'Sextans', nameZh: '六分仪座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['金牛', 'Taurus', 'Tau', 'jinniu', 'jn'], category: 'constellation', id: 'CON western Tau', nameEn: 'Taurus', nameZh: '金牛座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['望远镜', 'Telescopium', 'Tel'], category: 'constellation', id: 'CON western Tel', nameEn: 'Telescopium', nameZh: '望远镜座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['三角', 'Triangulum', 'Tri', 'sanjiao', 'sj'], category: 'constellation', id: 'CON western Tri', nameEn: 'Triangulum', nameZh: '三角座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['南三角', 'Triangulum Australe', 'TrA'], category: 'constellation', id: 'CON western TrA', nameEn: 'Triangulum Australe', nameZh: '南三角座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['杜鹃', 'Tucana', 'Tuc'], category: 'constellation', id: 'CON western Tuc', nameEn: 'Tucana', nameZh: '杜鹃座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['大熊', '北斗', '北斗七星', 'Ursa Major', 'Big Dipper', 'UMa', 'daxiong', 'dx', 'beidou', 'bd'], category: 'constellation', id: 'CON western UMa', nameEn: 'Ursa Major', nameZh: '大熊座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['小熊', '小北斗', 'Ursa Minor', 'Little Dipper', 'UMi', 'xiaoxiong', 'xx'], category: 'constellation', id: 'CON western UMi', nameEn: 'Ursa Minor', nameZh: '小熊座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['船帆', 'Vela', 'Vel'], category: 'constellation', id: 'CON western Vel', nameEn: 'Vela', nameZh: '船帆座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['处女', '处女座', '室女', 'Virgo', 'Vir', 'shinv', 'sn', 'chunv', 'cn'], category: 'constellation', id: 'CON western Vir', nameEn: 'Virgo', nameZh: '室女座', popular: true, typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['飞鱼', 'Volans', 'Vol'], category: 'constellation', id: 'CON western Vol', nameEn: 'Volans', nameZh: '飞鱼座', typeEn: 'Constellation', typeZh: '星座' },
  { aliases: ['狐狸', 'Vulpecula', 'Vul'], category: 'constellation', id: 'CON western Vul', nameEn: 'Vulpecula', nameZh: '狐狸座', typeEn: 'Constellation', typeZh: '星座' },
];

// -----------------------------------------------------------------------------
// 5. Artificial & Natural Satellites (Exported from satellites-data)
// -----------------------------------------------------------------------------
export { SATELLITE_OBJECTS } from './satellites-data';

// -----------------------------------------------------------------------------
// Master Catalog Aggregation
// -----------------------------------------------------------------------------
export const ALL_CELESTIAL_OBJECTS: CelestialSearchItem[] = [
  ...SOLAR_SYSTEM_OBJECTS,
  ...BRIGHT_STARS,
  ...DEEP_SKY_OBJECTS,
  ...CONSTELLATIONS,
  ...SATELLITE_OBJECTS,
];

// -----------------------------------------------------------------------------
// Search Algorithm & Ranking Implementation (100% Stellarium Semantic Alignment)
// -----------------------------------------------------------------------------

/**
 * Stellarium 官方模块注册及结果聚合顺序 (StelObjectMgr.cpp):
 * 1. SolarSystem (太阳系行星、太阳、月球)
 * 2. StarMgr (恒星)
 * 3. NebulaMgr (深空天体 DSO)
 * 4. ConstellationMgr (88 现代星座)
 * 5. Satellites (卫星、人造天体、空间站、彗星)
 */
export const STELLARIUM_MODULE_ORDER: CelestialCategory[] = [
  'solar_system',
  'stars',
  'dso',
  'constellation',
  'satellites',
];

export function searchCelestialObjects(
  query: string,
  category: CelestialSearchCategory = 'all',
  limit: number = 30,
): CelestialSearchItem[] {
  if (!Number.isFinite(limit) || limit <= 0) {
    return [];
  }

  const catalog = ALL_CELESTIAL_OBJECTS.filter(item =>
    category === 'all' ? true : item.category === category,
  );

  const cleanRaw = query.normalize('NFKC').trim();
  if (!cleanRaw) {
    // When query is empty or whitespace only, return curated popular items
    return catalog
      .filter(item => item.popular)
      .slice(0, limit);
  }

  const parsed = parseStellariumQuery(cleanRaw);
  const targetCategories = category === 'all'
    ? STELLARIUM_MODULE_ORDER
    : [category];

  const exactResults: CelestialSearchItem[] = [];
  const partialResults: CelestialSearchItem[] = [];

  for (const cat of targetCategories) {
    const itemsInCat = ALL_CELESTIAL_OBJECTS.filter(i => i.category === cat);

    const exactNativeItems: CelestialSearchItem[] = [];
    const exactPinyinItems: CelestialSearchItem[] = [];
    const partialNativeItems: CelestialSearchItem[] = [];
    const partialPinyinItems: CelestialSearchItem[] = [];

    for (const item of itemsInCat) {
      const matchRes = evaluateCelestialItemMatch(item, parsed);
      if (!matchRes.matched) {
        continue;
      }

      if (matchRes.isExact) {
        if (matchRes.isNative) {
          exactNativeItems.push(item);
        }
        else {
          exactPinyinItems.push(item);
        }
      }
      else {
        if (matchRes.isNative) {
          partialNativeItems.push(item);
        }
        else {
          partialPinyinItems.push(item);
        }
      }
    }

    // 组内保持固有顺序，完全匹配优先于部分匹配
    exactResults.push(...exactNativeItems, ...exactPinyinItems);
    partialResults.push(...partialNativeItems, ...partialPinyinItems);
  }

  // 全局排序：
  // 1. 各模块完全匹配项 (Exact Matches，按模块层级排序)
  // 2. 各模块包含匹配项 (Partial Matches，按模块层级排序)
  const combined = [...exactResults, ...partialResults];
  return combined.slice(0, limit);
}
