import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const input = new URL('../src/assets/stellar/data/tle_satellite.jsonl.gz', import.meta.url);
const output = new URL('../src/features/deep-space/calendar/satellite-photometry.json', import.meta.url);
const lines = gunzipSync(readFileSync(input)).toString('utf8').trim().split(/\r?\n/);
const photometry = {};

for (const line of lines) {
  const record = JSON.parse(line);
  const noradId = record.model_data?.norad_number;
  const standardMagnitude = record.model_data?.mag;
  if (!Number.isInteger(noradId) || !Number.isFinite(standardMagnitude))
    continue;
  photometry[noradId] = {
    name: record.short_name || record.names?.[0]?.replace(/^NAME\s+/, '') || `NORAD ${noradId}`,
    standardMagnitude,
  };
}

const sorted = Object.fromEntries(Object.entries(photometry).sort(([a], [b]) => Number(a) - Number(b)));
writeFileSync(output, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`Wrote ${Object.keys(sorted).length} satellite photometry records.`);
