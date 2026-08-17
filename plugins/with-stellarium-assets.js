const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('@expo/config-plugins');

function copyDirectory(source, destination) {
  fs.rmSync(destination, { force: true, recursive: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

/** Copies the versioned, offline Stellarium runtime into every generated Android app. */
module.exports = function withStellariumAssets(config) {
  return withDangerousMod(config, ['android', async (config) => {
    const source = path.join(config.modRequest.projectRoot, 'src', 'assets', 'stellar');
    const destination = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets', 'stellar');
    if (!fs.existsSync(path.join(source, 'stellarium-web-engine.wasm')))
      throw new Error('Missing src/assets/stellar runtime. Run scripts/check-stellarium-assets.mjs.');
    copyDirectory(source, destination);
    return config;
  }]);
};
