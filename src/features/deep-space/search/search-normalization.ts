import type { CelestialSearchItem } from './celestial-catalog';

/**
 * 常用汉字至全拼和首字母映射字典（包括天体名、星座名、常见别名）
 */
export const PINYIN_LOOKUP: Record<string, { pinyin: string[]; initials: string[] }> = {
  // 太阳系及代表天体
  太阳: { initials: ['ty'], pinyin: ['taiyang'] },
  月亮: { initials: ['yl'], pinyin: ['yueliang'] },
  月球: { initials: ['yq'], pinyin: ['yueqiu'] },
  水星: { initials: ['sx'], pinyin: ['shuixing'] },
  金星: { initials: ['jx'], pinyin: ['jinxing'] },
  长庚星: { initials: ['cgx'], pinyin: ['changgengxing'] },
  启明星: { initials: ['qmx'], pinyin: ['qimingxing'] },
  太白: { initials: ['tb'], pinyin: ['taibai'] },
  火星: { initials: ['hx'], pinyin: ['huoxing'] },
  荧惑: { initials: ['yh'], pinyin: ['yinghuo'] },
  木星: { initials: ['mx'], pinyin: ['muxing'] },
  岁星: { initials: ['sx'], pinyin: ['suixing'] },
  土星: { initials: ['tx'], pinyin: ['tuxing'] },
  镇星: { initials: ['zx'], pinyin: ['zhenxing'] },
  天王星: { initials: ['twx'], pinyin: ['tianwangxing'] },
  海王星: { initials: ['hwx'], pinyin: ['haiwangxing'] },
  冥王星: { initials: ['mwx'], pinyin: ['mingwangxing'] },

  // 卫星与空间站
  木卫一: { initials: ['mwy'], pinyin: ['muweiyi'] },
  木卫二: { initials: ['mwe'], pinyin: ['muweier'] },
  木卫三: { initials: ['mws'], pinyin: ['muweisan'] },
  木卫四: { initials: ['mws'], pinyin: ['muweisi'] },
  土卫六: { initials: ['twl'], pinyin: ['tuweiliu'] },
  土卫二: { initials: ['twe'], pinyin: ['tuweier'] },
  国际空间站: { initials: ['gjkjz'], pinyin: ['guojikongjianzhan'] },
  中国空间站: { initials: ['zgkjz'], pinyin: ['zhongguokongjianzhan'] },
  天宫: { initials: ['tg'], pinyin: ['tiangong'] },
  天和: { initials: ['th'], pinyin: ['tianhe'] },
  哈雷: { initials: ['hl'], pinyin: ['halei'] },
  哈雷彗星: { initials: ['hlhx'], pinyin: ['haleihuixing'] },
  海尔波普: { initials: ['hebp'], pinyin: ['haierbopu'] },

  // 亮星与星座
  织女: { initials: ['zn'], pinyin: ['zhinv', 'zhinu'] },
  织女星: { initials: ['znx'], pinyin: ['zhinvxing', 'zhinuxing'] },
  参宿四: { initials: ['sss', 'css'], pinyin: ['shensusi', 'cansusi', 'shensi'] },
  参宿七: { initials: ['ssq', 'csq'], pinyin: ['shensuqi', 'cansuqi', 'shenqi'] },
  参宿一: { initials: ['ssy', 'csy'], pinyin: ['shensuyi', 'cansuyi'] },
  参宿二: { initials: ['sse', 'cse'], pinyin: ['shensuer', 'cansuer'] },
  参宿三: { initials: ['sss', 'css'], pinyin: ['shensusan', 'cansusan'] },
  参宿五: { initials: ['ssw', 'csw'], pinyin: ['shensuwu', 'cansuwu'] },
  参宿六: { initials: ['ssl', 'csl'], pinyin: ['shensuliu', 'cansuliu'] },
  五车二: { initials: ['wce'], pinyin: ['wucheer', 'wuch eer'] },
  天狼: { initials: ['tl'], pinyin: ['tianlang'] },
  天狼星: { initials: ['tlx'], pinyin: ['tianlangxing'] },
  老人星: { initials: ['lrx'], pinyin: ['laorenxing'] },
  大角: { initials: ['dj'], pinyin: ['dajiao'] },
  大角星: { initials: ['djx'], pinyin: ['dajiaoxing'] },
  南门二: { initials: ['nme'], pinyin: ['nanmener'] },
  南河三: { initials: ['nhs'], pinyin: ['nanhesan'] },
  水委一: { initials: ['swy'], pinyin: ['shuiweiyi'] },
  心宿二: { initials: ['xse'], pinyin: ['xinshuer', 'xinsuer'] },
  毕宿五: { initials: ['bsw'], pinyin: ['bishuwu', 'bisuwu'] },
  角宿一: { initials: ['jsy'], pinyin: ['jiaoshuyi', 'jiaosuyi'] },
  北河三: { initials: ['bhs'], pinyin: ['beihesan'] },
  北河二: { initials: ['bhe'], pinyin: ['beiheer'] },
  北落师门: { initials: ['blsm'], pinyin: ['beiluoshimen'] },
  天津四: { initials: ['tjs'], pinyin: ['tianjinsi'] },
  十字架二: { initials: ['szje'], pinyin: ['shizijiaer'] },
  十字架三: { initials: ['szjs'], pinyin: ['shizijiasan'] },
  轩辕十四: { initials: ['xyss'], pinyin: ['xuanyuanshisi'] },
  北极星: { initials: ['bjx'], pinyin: ['beijixing'] },
  勾陈一: { initials: ['gcy'], pinyin: ['gouchenyi'] },
  大陵五: { initials: ['dlw'], pinyin: ['dalingwu'] },
  天枢: { initials: ['ts'], pinyin: ['tianshu'] },
  天璇: { initials: ['tx'], pinyin: ['tianxuan'] },
  天玑: { initials: ['tj'], pinyin: ['tianji'] },
  天权: { initials: ['tq'], pinyin: ['tianquan'] },
  玉衡: { initials: ['yh'], pinyin: ['yuheng'] },
  开阳: { initials: ['ky'], pinyin: ['kaiyang'] },
  摇光: { initials: ['yg'], pinyin: ['yaoguang'] },
  辅星: { initials: ['fx'], pinyin: ['fuxing'] },
  北斗: { initials: ['bd'], pinyin: ['beidou'] },
  北斗七星: { initials: ['bdqx'], pinyin: ['beidouqixing'] },
  牛郎: { initials: ['nl'], pinyin: ['niulang'] },
  牛郎星: { initials: ['nlx'], pinyin: ['niulangxing'] },
  河鼓二: { initials: ['hge'], pinyin: ['heguer'] },

  // 星座
  猎户: { initials: ['lh'], pinyin: ['liehu'] },
  猎户座: { initials: ['lh', 'lhz'], pinyin: ['liehuo', 'liehuozuo', 'liehu', 'liehuzuo'] },
  仙女: { initials: ['xn'], pinyin: ['xiannv', 'xiannu', 'xiannü'] },
  仙女座: { initials: ['xnz', 'xn'], pinyin: ['xiannvzuo', 'xiannuzuo', 'xiannv', 'xiannu', 'xiannü'] },
  牧夫: { initials: ['mf'], pinyin: ['mufu'] },
  牧夫座: { initials: ['mfz', 'mf'], pinyin: ['mufuzuo', 'mufu'] },
  长蛇: { initials: ['cs'], pinyin: ['changshe'] },
  长蛇座: { initials: ['csz', 'cs'], pinyin: ['changshezuo', 'changshe'] },
  后发: { initials: ['hf'], pinyin: ['houfa'] },
  后发座: { initials: ['hfz', 'hf'], pinyin: ['houfazuo', 'houfa'] },
  天秤: { initials: ['tc', 'tp'], pinyin: ['tiancheng', 'tianping'] },
  天秤座: { initials: ['tcz', 'tpz', 'tc', 'tp'], pinyin: ['tianchengzuo', 'tianpingzuo', 'tiancheng', 'tianping'] },
  天平: { initials: ['tp'], pinyin: ['tianping'] },
  天平座: { initials: ['tpz', 'tp'], pinyin: ['tianpingzuo', 'tianping'] },
  金牛: { initials: ['jn'], pinyin: ['jinniu'] },
  金牛座: { initials: ['jnz', 'jn'], pinyin: ['jinniuzuo', 'jinniu'] },
  大犬: { initials: ['dq'], pinyin: ['daquan'] },
  大犬座: { initials: ['dqz', 'dq'], pinyin: ['daquanzuo', 'daquan'] },
  小犬: { initials: ['xq'], pinyin: ['xiaoquan'] },
  小犬座: { initials: ['xqz', 'xq'], pinyin: ['xiaoquanzuo', 'xiaoquan'] },
  天鹅: { initials: ['te'], pinyin: ['tiane'] },
  天鹅座: { initials: ['tez', 'te'], pinyin: ['tianezuo', 'tiane'] },
  天琴: { initials: ['tq'], pinyin: ['tianqin'] },
  天琴座: { initials: ['tqz', 'tq'], pinyin: ['tianqinzuo', 'tianqin'] },
  大熊: { initials: ['dx'], pinyin: ['daxiong'] },
  大熊座: { initials: ['dxz', 'dx'], pinyin: ['daxiongtuo', 'daxiong'] },
  小熊: { initials: ['xx'], pinyin: ['xiaoxiong'] },
  小熊座: { initials: ['xxz', 'xx'], pinyin: ['xiaoxiongtuo', 'xiaoxiong'] },
  狮子: { initials: ['sz'], pinyin: ['shizi'] },
  狮子座: { initials: ['szz', 'sz'], pinyin: ['shizizuo', 'shizi'] },
  双子: { initials: ['sz'], pinyin: ['shuangzi'] },
  双子座: { initials: ['szz', 'sz'], pinyin: ['shuangzizuo', 'shuangzi'] },
  室女: { initials: ['sn'], pinyin: ['shinv', 'shinu'] },
  室女座: { initials: ['snz', 'sn'], pinyin: ['shinvzuo', 'shinuzuo', 'shinv', 'shinu'] },
  处女: { initials: ['cn'], pinyin: ['chunv', 'chunu'] },
  处女座: { initials: ['cnz', 'cn'], pinyin: ['chunvzuo', 'chunuzuo', 'chunv', 'chunu'] },
  天蝎: { initials: ['tx'], pinyin: ['tianxie'] },
  天蝎座: { initials: ['txz', 'tx'], pinyin: ['tianxiezuo', 'tianxie'] },
  人马: { initials: ['rm'], pinyin: ['renma'] },
  人马座: { initials: ['rmz', 'rm'], pinyin: ['renmazuo', 'renma'] },
  射手: { initials: ['ss'], pinyin: ['sheshou'] },
  射手座: { initials: ['ssz', 'ss'], pinyin: ['sheshouzuo', 'sheshou'] },
  宝瓶: { initials: ['bp'], pinyin: ['baoping'] },
  宝瓶座: { initials: ['bpz', 'bp'], pinyin: ['baopingzuo', 'baoping'] },
  水瓶: { initials: ['sp'], pinyin: ['shuiping'] },
  水瓶座: { initials: ['spz', 'sp'], pinyin: ['shuipingzuo', 'shuiping'] },
  摩羯: { initials: ['mj'], pinyin: ['mojie'] },
  摩羯座: { initials: ['mjz', 'mj'], pinyin: ['mojiezuo', 'mojie'] },
  白羊: { initials: ['by'], pinyin: ['baiyang'] },
  白羊座: { initials: ['byz', 'by'], pinyin: ['baiyangzuo', 'baiyang'] },
  双鱼: { initials: ['sy'], pinyin: ['shuangyu'] },
  双鱼座: { initials: ['syz', 'sy'], pinyin: ['shuangyuzuo', 'shuangyu'] },
  巨蟹: { initials: ['jx'], pinyin: ['juxie'] },
  巨蟹座: { initials: ['jxz', 'jx'], pinyin: ['juxiezuo', 'juxie'] },
  武仙: { initials: ['wx'], pinyin: ['wuxian'] },
  武仙座: { initials: ['wxz', 'wx'], pinyin: ['wuxianzuo', 'wuxian'] },
  英仙: { initials: ['yx'], pinyin: ['yingxian'] },
  英仙座: { initials: ['yxz', 'yx'], pinyin: ['yingxianzuo', 'yingxian'] },
  仙后: { initials: ['xh'], pinyin: ['xianhou'] },
  仙后座: { initials: ['xhz', 'xh'], pinyin: ['xianhouzuo', 'xianhou'] },
  飞马: { initials: ['fm'], pinyin: ['feima'] },
  飞马座: { initials: ['fmz', 'fm'], pinyin: ['feimazuo', 'feima'] },
  御夫: { initials: ['yf'], pinyin: ['yufu'] },
  御夫座: { initials: ['yfz', 'yf'], pinyin: ['yufuzuo', 'yufu'] },

  // 深空与星云
  蟹状星云: { initials: ['xzxy'], pinyin: ['xiezhuangxingyun'] },
  猎户座大星云: { initials: ['lhzdxy'], pinyin: ['liehuozuodaxingyun'] },
  仙女座大星系: { initials: ['xnzdxi'], pinyin: ['xiannvzuodaxingxi', 'xiannuzuodaxingxi'] },
  昴星团: { initials: ['mxt'], pinyin: ['maoxingtuan'] },
  蜂巢星团: { initials: ['fhxt'], pinyin: ['fenghaoxingtuan'] },
  鬼星团: { initials: ['gxt'], pinyin: ['guixingtuan'] },
  风车星系: { initials: ['fcxx'], pinyin: ['fengchexingxi'] },
  涡状星系: { initials: ['wzxx'], pinyin: ['wozhuangxingxi'] },
  环状星云: { initials: ['hzxy'], pinyin: ['huanzhuangxingyun'] },
  草帽星系: { initials: ['cmxx'], pinyin: ['caomaoxingxi'] },
  雪茄星系: { initials: ['xjxx'], pinyin: ['xuejiaxingxi'] },
  波德星系: { initials: ['bdxx'], pinyin: ['bodexingxi'] },
  黑眼星系: { initials: ['hyxx'], pinyin: ['heiyanxingxi'] },
  北美洲星云: { initials: ['bmzxy'], pinyin: ['beimeizhouxingyun'] },
  玫瑰星云: { initials: ['mgxy'], pinyin: ['meiguixingyun'] },
  马头星云: { initials: ['mtxy'], pinyin: ['matouxingyun'] },
  螺旋星云: { initials: ['lxxy'], pinyin: ['luoxuanxingyun'] },
};

/**
 * 剥离拉丁字母的重音符号和组合变音符号
 * 例如 "Boötes" -> "Bootes", "xiannü" -> "xiannu"
 */
export function stripDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036F]/g, '');
}

/**
 * 希腊字母与拉丁音译对照表
 */
const GREEK_LETTER_MAP: Record<string, string> = {
  α: 'alpha',
  β: 'beta',
  γ: 'gamma',
  δ: 'delta',
  ε: 'epsilon',
  ζ: 'zeta',
  η: 'eta',
  θ: 'theta',
  ι: 'iota',
  κ: 'kappa',
  λ: 'lambda',
  μ: 'mu',
  ν: 'nu',
  ξ: 'xi',
  ο: 'omicron',
  π: 'pi',
  ρ: 'rho',
  σ: 'sigma',
  τ: 'tau',
  υ: 'upsilon',
  φ: 'phi',
  χ: 'chi',
  ψ: 'psi',
  ω: 'omega',
};

const LATIN_TO_GREEK_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(GREEK_LETTER_MAP).map(([greek, latin]) => [latin, greek]),
);

/**
 * 生成希腊字母与拉丁字母互相替换后的变体集合
 */
export function expandGreekVariants(rawLower: string): string[] {
  const variants = new Set<string>([rawLower]);

  if (rawLower.includes('ü')) {
    variants.add(rawLower.replace(/ü/g, 'v'));
    variants.add(rawLower.replace(/ü/g, 'u'));
  }

  for (const [latin, greek] of Object.entries(LATIN_TO_GREEK_MAP)) {
    const reg = new RegExp(`\\b${latin}\\b`, 'gi');
    if (reg.test(rawLower)) {
      variants.add(rawLower.replace(reg, greek));
    }
  }

  for (const [greek, latin] of Object.entries(GREEK_LETTER_MAP)) {
    if (rawLower.includes(greek)) {
      variants.add(rawLower.replace(new RegExp(greek, 'g'), latin));
    }
  }

  return Array.from(variants);
}

/**
 * 结构化规范解析结果
 */
export type ParsedStellariumQuery = {
  rawClean: string;
  lowerClean: string;
  compact: string;
  noAccent: string;
  noAccentCompact: string;
  variants: string[];
  hipNumber?: number;
  dsoCatalog?: {
    prefix: string;
    number: number;
    patterns: string[];
  };
};

/**
 * Stellarium StarMgr.cpp:
 * static const QRegularExpression hpRx("^(HIP|HP)\\s*(\\d+)\\s*.*$", QRegularExpression::CaseInsensitiveOption);
 */
export const STELLARIUM_HP_REGEX = /^(?:HIP|HP)\s*0*(\d+)(?:[\s/].*)?$/i;

/**
 * Stellarium NebulaMgr.cpp:
 * static const QRegularExpression catNumRx("^(M|NGC|IC|C|...)\\s*(\\d+)$");
 */
export const STELLARIUM_DSO_REGEX = /^([MCB]|NGC|IC|CALDWELL|VDB|RCW|LDN|LBN|CR|MEL|PGC|UGC|ARP|VV|DWB|TR|TRUMPLER|ST|STOCK|RU|RUPRECHT|VDB-HA)\s*0*(\d+)$/i;

/**
 * 解析用户输入的查询字符串，提炼 Stellarium 官方匹配所需的各种规范化形态与编号
 */
export function parseStellariumQuery(query: string): ParsedStellariumQuery {
  const rawClean = query.normalize('NFKC').trim();
  const lowerClean = rawClean.toLowerCase().replace(/[\s\-_]+/g, ' ');
  const compact = lowerClean.replace(/\s+/g, '');
  const noAccent = stripDiacritics(lowerClean);
  const noAccentCompact = stripDiacritics(compact);

  const variantsSet = new Set<string>([
    lowerClean,
    compact,
    noAccent,
    noAccentCompact,
  ]);

  for (const v of expandGreekVariants(lowerClean)) {
    variantsSet.add(v);
    variantsSet.add(v.replace(/\s+/g, ''));
    variantsSet.add(stripDiacritics(v));
    variantsSet.add(stripDiacritics(v.replace(/\s+/g, '')));
  }

  // 1. HIP / HP 编号检测 (StarMgr.cpp 源码语义)
  let hipNumber: number | undefined;
  const hipMatch = rawClean.match(STELLARIUM_HP_REGEX);
  if (hipMatch) {
    hipNumber = Number.parseInt(hipMatch[1], 10);
  }

  // 2. Messier / NGC / IC / Caldwell 等编号检测 (NebulaMgr.cpp 源码语义)
  let dsoCatalog: ParsedStellariumQuery['dsoCatalog'];
  const dsoMatch = rawClean.match(STELLARIUM_DSO_REGEX);
  if (dsoMatch) {
    const rawPrefix = dsoMatch[1].toUpperCase();
    const number = Number.parseInt(dsoMatch[2], 10);
    const prefix = rawPrefix === 'CALDWELL' ? 'C' : rawPrefix;
    const patterns = [
      `${prefix} ${number}`,
      `${prefix}${number}`,
    ];
    if (prefix === 'C') {
      patterns.push(`CALDWELL ${number}`, `CALDWELL${number}`);
    }
    dsoCatalog = { number, patterns: patterns.map(p => p.toLowerCase()), prefix };
  }

  return {
    compact,
    dsoCatalog,
    hipNumber,
    lowerClean,
    noAccent,
    noAccentCompact,
    rawClean,
    variants: Array.from(variantsSet),
  };
}

export type ItemMatchResult = {
  matched: boolean;
  isExact: boolean;
  isNative: boolean;
};

/**
 * 恒星 HIP / HP 编号精确匹配 (StarMgr.cpp 源码语义)
 */
function matchStarHip(item: CelestialSearchItem, targetHip: number): boolean {
  const stringsToCheck = [
    item.id,
    item.designation,
    ...(item.aliases || []),
  ].filter(Boolean) as string[];

  for (const s of stringsToCheck) {
    const m = s.match(/(?:HIP|HP)\s*0*(\d+)/i);
    if (m && Number.parseInt(m[1], 10) === targetHip) {
      return true;
    }
  }
  return false;
}

/**
 * 深空天体目录编号规范化匹配 (NebulaMgr.cpp 源码语义)
 */
function matchDsoCatalog(
  item: CelestialSearchItem,
  dsoCatalog: NonNullable<ParsedStellariumQuery['dsoCatalog']>,
): { matched: boolean; isExact: boolean } {
  const stringsToCheck = [
    item.id,
    item.designation,
    ...(item.aliases || []),
  ].filter(Boolean) as string[];

  for (const raw of stringsToCheck) {
    const clean = raw.toLowerCase().replace(/[\s\-_]+/g, ' ');
    const comp = clean.replace(/\s+/g, '');

    for (const pat of dsoCatalog.patterns) {
      const patComp = pat.replace(/\s+/g, '');
      if (clean === pat || comp === patComp) {
        return { isExact: true, matched: true };
      }
    }
  }

  // 若 id 形如 "M 42" 且 catalog 为 M，精确比对数字
  if (dsoCatalog.prefix === 'M') {
    const mMatch = item.id.match(/^M\s*0*(\d+)$/i);
    if (mMatch && Number.parseInt(mMatch[1], 10) === dsoCatalog.number) {
      return { isExact: true, matched: true };
    }
  }

  return { isExact: false, matched: false };
}

/**
 * 区分原生名称与纯小写离线拼音别名
 */
function isPinyinAlias(str: string): boolean {
  // 包含中文字符或数字或标点、大写字母的，属于原生名称/目录别名
  if (/[\u4E00-\u9FA5\d\s/\\_\-A-Z]/.test(str)) {
    return false;
  }
  // 纯小写英文字母字符串视为拼音别名（如 'jinxing', 'jx', 'tianlang', 'tl'）
  return /^[a-z]+$/.test(str);
}

/**
 * 原生标识字符串集合构建与匹配 (包含英文名、本地化名、标准别名、官方标识)
 */
function matchNativeStrings(
  item: CelestialSearchItem,
  parsed: ParsedStellariumQuery,
): { matched: boolean; isExact: boolean } {
  const nativeNames: string[] = [
    item.nameEn,
    item.nameZh,
    item.id.replace(/^(?:NAME|CON western)\s+/i, ''),
    item.id,
  ];

  if (item.designation) {
    nativeNames.push(item.designation);
  }

  if (item.aliases) {
    for (const a of item.aliases) {
      if (!isPinyinAlias(a)) {
        nativeNames.push(a);
      }
    }
  }

  let exactFound = false;
  let partialFound = false;

  for (const raw of nativeNames) {
    const clean = raw.normalize('NFKC').toLowerCase().replace(/[\s\-_]+/g, ' ');
    const comp = clean.replace(/\s+/g, '');
    const noAcc = stripDiacritics(clean);
    const noAccComp = stripDiacritics(comp);

    const candidates = [clean, comp, noAcc, noAccComp];

    for (const q of parsed.variants) {
      if (candidates.includes(q)) {
        exactFound = true;
        break;
      }
      for (const c of candidates) {
        if (c.includes(q)) {
          partialFound = true;
          break;
        }
      }
      if (exactFound) {
        break;
      }
    }

    if (exactFound) {
      break;
    }
  }

  return { isExact: exactFound, matched: exactFound || partialFound };
}

/**
 * 拼音查表与拼音别名匹配通道（中文增强通道，独立于 Stellarium 原生标识）
 */
function matchPinyinChannel(
  item: CelestialSearchItem,
  parsed: ParsedStellariumQuery,
): { matched: boolean; isExact: boolean } {
  const q = parsed.compact;
  const qLen = q.length;

  // 1. 检查 item.aliases 中显式声明的拼音别名（如猎户座的 'liehu', 'lh'）
  if (item.aliases) {
    for (const a of item.aliases) {
      if (!isPinyinAlias(a)) {
        continue;
      }
      const lower = a.toLowerCase();
      // 显式声明的拼音完全相等 -> 完全匹配 (Exact)
      if (lower === q) {
        return { isExact: true, matched: true };
      }
      if (qLen >= 2 && lower.startsWith(q)) {
        return { isExact: false, matched: true };
      }
    }
  }

  // 2. 检查 PINYIN_LOOKUP 查表字典
  // 仅针对天体自身名称及完整中文别名（如 '织女星', '猎户座大星云', '参宿四', '长庚星'）
  const chineseWords = [
    item.nameZh,
    ...(item.aliases || []).filter(a => /[\u4E00-\u9FA5]/.test(a)),
  ].filter(Boolean) as string[];

  let partialMatch = false;

  for (const raw of chineseWords) {
    const cleanZh = raw.replace(/\s*\([^)]*\)/g, '').trim();
    const cleanBase = cleanZh.replace(/座$/, '');

    for (const [key, pyData] of Object.entries(PINYIN_LOOKUP)) {
      // 必须完全对应天体中文名或核心别名，避免别名中含字（如'猎户座β'）误将整颗星当成猎户拼音
      if (cleanZh !== key && cleanBase !== key) {
        continue;
      }

      // 全拼完全匹配 -> 完全匹配
      if (pyData.pinyin.includes(q)) {
        return { isExact: true, matched: true };
      }

      // 首字母完全匹配 -> 完全匹配
      if (pyData.initials.includes(q)) {
        return { isExact: true, matched: true };
      }

      // 全拼前缀或包含匹配 -> 部分匹配
      if (pyData.pinyin.some(py => py.startsWith(q) || py.includes(q))) {
        partialMatch = true;
      }

      // 首字母缩写前缀匹配（长度 >= 2 避免单字母冲淡原生匹配）
      if (qLen >= 2 && pyData.initials.some(init => init.startsWith(q))) {
        partialMatch = true;
      }
    }
  }

  return { isExact: false, matched: partialMatch };
}

/**
 * 综合评估天体是否命中查询，严格遵循 Stellarium 源码语义
 */
export function evaluateCelestialItemMatch(
  item: CelestialSearchItem,
  parsed: ParsedStellariumQuery,
): ItemMatchResult {
  // 1. HIP / HP 编号优先匹配 (StarMgr.cpp)
  if (parsed.hipNumber !== undefined) {
    const hipHit = matchStarHip(item, parsed.hipNumber);
    if (hipHit) {
      return { isExact: true, isNative: true, matched: true };
    }
    // 若查询是明确的 HIP 编号形态，未命中此 HIP 的恒星不再作为泛字符串匹配
    return { isExact: false, isNative: false, matched: false };
  }

  // 2. DSO 目录编号优先匹配 (NebulaMgr.cpp)
  if (parsed.dsoCatalog) {
    const dsoHit = matchDsoCatalog(item, parsed.dsoCatalog);
    if (dsoHit.matched) {
      return { isExact: dsoHit.isExact, isNative: true, matched: true };
    }
  }

  // 3. 原生中英文名/标准别名/标识符匹配
  const nativeHit = matchNativeStrings(item, parsed);
  if (nativeHit.matched) {
    return {
      isExact: nativeHit.isExact,
      isNative: true,
      matched: true,
    };
  }

  // 4. 中文拼音通道补充匹配
  const pinyinHit = matchPinyinChannel(item, parsed);
  if (pinyinHit.matched) {
    return {
      isExact: pinyinHit.isExact,
      isNative: false,
      matched: true,
    };
  }

  return { isExact: false, isNative: false, matched: false };
}
