import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const base = process.env.LUCK_REPAIR_URL || 'http://127.0.0.1:5250';
let server;
try {
  try {
    await fetch(base, { signal: AbortSignal.timeout(1000) });
  } catch {
    if (process.env.LUCK_REPAIR_URL)
      throw new Error('The configured repair acceptance server is not reachable.');
    server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5250', '--strictPort'],
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
    if (!ready) throw new Error('The repair acceptance server could not start.');
  }
  for (const file of [
    'grammar-repairs.browser.mjs',
    'interchange-repairs.browser.mjs',
    'linked-history-repairs.browser.mjs',
    'original-portability.browser.mjs',
    'review-snapshot.browser.mjs',
  ]) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--experimental-strip-types', `tests/${file}`], {
        cwd: root,
        windowsHide: true,
        stdio: 'inherit',
        env: {
          ...process.env,
          LUCK_REPAIR_URL: base,
          LUCK_TEST_URL: base,
          LUCK_INTERCHANGE_URL: base,
        },
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
