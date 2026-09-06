import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const base = process.env.LUCK_FUNCTIONAL_URL || 'http://127.0.0.1:5237';
let server;
try {
  try {
    await fetch(base, { signal: AbortSignal.timeout(1000) });
  } catch {
    if (process.env.LUCK_FUNCTIONAL_URL)
      throw new Error('The configured functional test server is not reachable.');
    server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5237', '--strictPort'],
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
    if (!ready) throw new Error('The functional test server could not start.');
  }
  for (const file of [
    'functional-improvements.browser.mjs',
    'table-pagination.browser.mjs',
    'entry-transfer.browser.mjs',
    'reference-import.browser.mjs',
    'docx-export.browser.mjs',
  ]) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--experimental-strip-types', `tests/${file}`], {
        cwd: root,
        windowsHide: true,
        stdio: 'inherit',
        env: { ...process.env, LUCK_FUNCTIONAL_URL: base, LUCK_TEST_URL: base },
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
