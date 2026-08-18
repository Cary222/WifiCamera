import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const patch = path.join(projectRoot, 'patches', 'react-native-webview+13.15.0.patch');

function applies(arguments_) {
  try {
    execFileSync('git', arguments_, { cwd: projectRoot, stdio: 'pipe' });
    return true;
  }
  catch { return false; }
}

if (applies(['apply', '--reverse', '--check', patch])) {
  console.log('Stellarium WebView AssetLoader patch already applied.');
}
else if (applies(['apply', '--check', patch])) {
  execFileSync('git', ['apply', patch], { cwd: projectRoot, stdio: 'inherit' });
  console.log('Applied Stellarium WebView AssetLoader patch.');
}
else {
  throw new Error('react-native-webview no longer matches the supported 13.15.0 AssetLoader patch.');
}
