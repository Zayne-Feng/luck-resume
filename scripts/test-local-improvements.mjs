import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const base = process.env.LUCK_IMPROVEMENTS_URL || 'http://127.0.0.1:5196';
let server;
try {
  try {
    await fetch(base, { signal: AbortSignal.timeout(1500) });
  } catch {
    if (process.env.LUCK_IMPROVEMENTS_URL)
      throw new Error('The configured local improvement server is not reachable.');
    server = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
        '--host',
        '127.0.0.1',
        '--port',
        '5196',
        '--strictPort',
      ],
      { cwd: root, windowsHide: true, stdio: 'ignore' },
    );
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      try {
        await fetch(base, { signal: AbortSignal.timeout(1000) });
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    if (!ready) throw new Error('The local improvement server could not start.');
  }
  for (const file of [
    'editor-discovery.browser.mjs',
    'local-improvements.browser.mjs',
    'layout-quality.browser.mjs',
    'version-history.browser.mjs',
    'workspace-backup.browser.mjs',
    'removal-persistence.browser.mjs',
  ]) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--experimental-strip-types', `tests/${file}`], {
        cwd: root,
        windowsHide: true,
        stdio: 'inherit',
        env: { ...process.env, LUCK_TEST_URL: base, LUCK_PARITY_URL: base },
      });
      child.on('error', reject);
      child.on('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`${file} failed (${code}).`)),
      );
    });
  }
} finally {
  server?.kill();
}
