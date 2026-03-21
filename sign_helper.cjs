const { spawn } = require('child_process');
const file = process.argv[2];
const child = spawn('npx.cmd', ['tauri', 'signer', 'sign', file], {
  stdio: ['pipe', 'inherit', 'inherit'],
  env: { ...process.env }
});
// Wait then send empty password
setTimeout(() => {
  child.stdin.write('\r\n');
  child.stdin.end();
}, 2000);
child.on('exit', (code) => {
  console.log('Exit code:', code);
  process.exit(code);
});
