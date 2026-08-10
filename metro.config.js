// Polyfill for Node.js 18 compatibility - must be first
if (!Array.prototype.toReversed) {
  // eslint-disable-next-line no-extend-native
  Array.prototype.toReversed = function () {
    return [...this].reverse();
  };
}

const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: path.join(__dirname, 'uniwind-types.d.ts'),
});
