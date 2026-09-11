export type SkyCoordinate = {
  decDeg: number;
  raHours: number;
};

const HMS_COORDINATE_PATTERN = /^([+-]?\d{1,2})\s*h\s*(\d{1,2})\s*m\s*(\d{1,2}(?:\.\d+)?)\s*s[,\s]+([+-]?\d{1,2})\s*d\s*(\d{1,2})\s*m\s*(\d{1,2}(?:\.\d+)?)\s*s$/i;
const DECIMAL_COORDINATE_PATTERN = /^([+-]?\d+(?:\.\d+)?)[,\s]+([+-]?\d+(?:\.\d+)?)$/;
const ABBREVIATED_COORDINATE_PATTERN = /^(\d{1,2})\s*h\s*(\d{1,2})\s*m[,\s]+([+-]?\d{1,2})\s*d\s*(\d{1,2})\s*m$/i;

const FULLWIDTH_DIGIT_FIRST = '０'.charCodeAt(0);
const FULLWIDTH_DIGIT_LAST = '９'.charCodeAt(0);

function normalizeCoordinateInput(input: string): string {
  const normalized = input
    .trim()
    .replaceAll('°', 'd')
    .replaceAll('′', 'm')
    .replaceAll('″', 's')
    .replaceAll(/'/g, 'm')
    .replaceAll('"', 's')
    .replaceAll('，', ',')
    .replaceAll('−', '-')
    .replace(/\s+/g, ' ');

  return Array.from(normalized, (character) => {
    const code = character.charCodeAt(0);
    return code >= FULLWIDTH_DIGIT_FIRST && code <= FULLWIDTH_DIGIT_LAST ? String.fromCharCode(code - FULLWIDTH_DIGIT_FIRST + 48) : character;
  }).join('');
}

function parseHmsCoordinate(input: string): SkyCoordinate | null {
  const match = HMS_COORDINATE_PATTERN.exec(input);
  if (!match) {
    return null;
  }

  const [, rawHours, rawRaMinutes, rawRaSeconds, rawDegrees, rawDecMinutes, rawDecSeconds] = match;
  const hours = Number(rawHours);
  const raMinutes = Number(rawRaMinutes);
  const raSeconds = Number(rawRaSeconds);
  const degrees = Number(rawDegrees);
  const decMinutes = Number(rawDecMinutes);
  const decSeconds = Number(rawDecSeconds);
  const absoluteDegrees = Math.abs(degrees);

  if (hours < 0 || hours >= 24 || raMinutes >= 60 || raSeconds >= 60 || absoluteDegrees > 90 || decMinutes >= 60 || decSeconds >= 60) {
    return null;
  }
  if (absoluteDegrees === 90 && (decMinutes > 0 || decSeconds > 0)) {
    return null;
  }

  const raHours = hours + raMinutes / 60 + raSeconds / 3600;
  const decMagnitude = absoluteDegrees + decMinutes / 60 + decSeconds / 3600;
  const hasNegativeDeclination = rawDegrees.startsWith('-');
  return {
    decDeg: hasNegativeDeclination ? -decMagnitude : decMagnitude,
    raHours,
  };
}

function parseAbbreviatedCoordinate(input: string): SkyCoordinate | null {
  const match = ABBREVIATED_COORDINATE_PATTERN.exec(input);
  if (!match) {
    return null;
  }

  const [, rawHours, rawRaMinutes, rawDegrees, rawDecMinutes] = match;
  const hours = Number(rawHours);
  const raMinutes = Number(rawRaMinutes);
  const degrees = Number(rawDegrees);
  const decMinutes = Number(rawDecMinutes);
  const absoluteDegrees = Math.abs(degrees);

  if (hours >= 24 || raMinutes >= 60 || absoluteDegrees > 90 || decMinutes >= 60) {
    return null;
  }
  if (absoluteDegrees === 90 && decMinutes > 0) {
    return null;
  }

  return {
    decDeg: rawDegrees.startsWith('-') ? -(absoluteDegrees + decMinutes / 60) : absoluteDegrees + decMinutes / 60,
    raHours: hours + raMinutes / 60,
  };
}

function parseDecimalCoordinate(input: string): SkyCoordinate | null {
  const match = DECIMAL_COORDINATE_PATTERN.exec(input);
  if (!match) {
    return null;
  }

  const [, rawRaDeg, rawDecDeg] = match;
  const raDeg = Number(rawRaDeg);
  const decDeg = Number(rawDecDeg);
  if (raDeg < 0 || raDeg >= 360 || decDeg < -90 || decDeg > 90) {
    return null;
  }

  return {
    decDeg,
    raHours: raDeg / 15,
  };
}

export function parseSkyCoordinateInput(input: string): SkyCoordinate | null {
  const normalized = normalizeCoordinateInput(input);
  return parseHmsCoordinate(normalized) ?? parseAbbreviatedCoordinate(normalized) ?? parseDecimalCoordinate(normalized);
}
