#!/usr/bin/env node
/** Verify both directions, byte-for-byte; normalization can hide packaged drift. */
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { differingFiles, projectRoot, snapshotTree, stellarPaths } from './sync-stellar-assets.mjs';

export function verifyStellarSync(root) {
  const paths = stellarPaths(root);
  const sources = snapshotTree(paths.source);
  const targets = snapshotTree(paths.target);
  const differences = differingFiles(sources, targets);
  if (!Object.keys(sources).length)
    throw new Error('Empty stellar source');
  if (differences.length)
    throw new Error(`Stellar mirror mismatch (missing / extra / changed):\n${differences.map(name => `  ${name}`).join('\n')}`);
  return sources;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { root: { type: 'string' } } });
    const files = verifyStellarSync(path.resolve(values.root ?? projectRoot));
    console.log(`[verify-stellar] Byte-identical mirror: ${Object.keys(files).length} files.`);
  }
  catch (error) {
    console.error(`[verify-stellar] ${error.message}`);
    process.exitCode = 1;
  }
}
