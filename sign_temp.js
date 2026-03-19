const { execSync } = require('child_process');
const file = 'src-tauri/target/release/bundle/nsis/MegaLoad_0.13.12_x64-setup.nsis.zip';
try {
  execSync('npx tauri signer sign "' + file + '"', { input: '\n', stdio: ['pipe', 'inherit', 'inherit'], timeout: 15000 });
  console.log('SUCCESS');
} catch(e) {
  console.log('Error:', e.status);
}
