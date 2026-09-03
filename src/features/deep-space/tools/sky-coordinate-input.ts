export type SkyCoordinate = {
  decDeg: number;
  raHours: number;
};

const COORDINATE_PATTERN = /^(\d{1,2})\s*h\s*(\d{1,2})\s*m\s*(\d{1,2}(?:\.\d+)?)\s*s\s*([+-]?\d{1,2})\s*d\s*(\d{1,2})\s*m\s*(\d{1,2}(?:\.\d+)?)\s*s$/i;

function normalizeCoordinateInput(input: string): string {
  return input
    .trim()
    .replaceAll('°', 'd')
    .replaceAll('′', 'm')
    .replaceAll('″', 's')
    .replaceAll(/'/g, 'm')
    .replaceAll('"', 's');
}

export function parseSkyCoordinateInput(input: string): SkyCoordinate | null {
  const match = COORDINATE_PATTERN.exec(normalizeCoordinateInput(input));
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

  if (hours >= 24 || raMinutes >= 60 || raSeconds >= 60 || absoluteDegrees > 90 || decMinutes >= 60 || decSeconds >= 60) {
    return null;
  }
  if (absoluteDegrees === 90 && (decMinutes > 0 || decSeconds > 0)) {
    return null;
  }

  const raHours = hours + raMinutes / 60 + raSeconds / 3600;
  const decMagnitude = absoluteDegrees + decMinutes / 60 + decSeconds / 3600;
  return {
    decDeg: degrees < 0 ? -decMagnitude : decMagnitude,
    raHours,
  };
}
