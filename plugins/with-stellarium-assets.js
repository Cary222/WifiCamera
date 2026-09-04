const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');

function copyDirectory(source, destination) {
  fs.rmSync(destination, { force: true, recursive: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

function requireRuntime(source) {
  if (!fs.existsSync(path.join(source, 'stellarium-web-engine.wasm'))) {
    throw new Error(
      'Missing src/assets/stellar runtime. Run scripts/check-stellarium-assets.mjs.',
    );
  }
}

/** Copies the versioned, offline Stellarium runtime into every generated app. */
module.exports = function withStellariumAssets(config) {
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const source = path.join(
        config.modRequest.projectRoot,
        'src',
        'assets',
        'stellar',
      );
      requireRuntime(source);
      const destination = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'assets',
        'stellar',
      );
      copyDirectory(source, destination);
      return config;
    },
  ]);

  // iOS has no asset-loader URL scheme: the runtime ships as a bundle folder
  // and WKWebView loads file://<bundle>/stellar/index.html (see stellarium-view.tsx).
  config = withXcodeProject(config, async (config) => {
    const source = path.join(
      config.modRequest.projectRoot,
      'src',
      'assets',
      'stellar',
    );
    requireRuntime(source);
    const projectName = config.modRequest.projectName;
    copyDirectory(
      source,
      path.join(config.modRequest.platformProjectRoot, projectName, 'stellar'),
    );

    // addResourceFile crashes when the template has no 'Resources' PBXGroup, and
    // addFile alone lacks the PBXBuildFile uuid pbxBuildPhaseObj needs (it would
    // emit `value = undefined`, which CocoaPods refuses to parse). This mirrors
    // addSourceFile for the Resources phase; addFile returns null on re-runs.
    const project = config.modResults;
    const file = project.addFile(
      path.join(projectName, 'stellar'),
      project.getFirstProject().firstProject.mainGroup,
      {
        lastKnownFileType: 'folder',
        sourceTree: '"<group>"',
      },
    );
    if (file) {
      file.uuid = project.generateUuid();
      project.addToPbxBuildFileSection(file);
      project.addToPbxResourcesBuildPhase(file);
    }
    return config;
  });

  return config;
};
