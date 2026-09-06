import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const base = process.env.LUCK_FREEDOM_URL || 'http://127.0.0.1:5199';
let server;
try {
  try {
    await fetch(base, { signal: AbortSignal.timeout(1000) });
  } catch {
    if (process.env.LUCK_FREEDOM_URL)
      throw new Error('The configured editor acceptance server is not reachable.');
    server = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
        '--host',
        '127.0.0.1',
        '--port',
        '5199',
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
    if (!ready) throw new Error('The editor acceptance server could not start.');
  }
  for (const file of [
    'editor-freedom.browser.mjs',
    'advanced-pagination.browser.mjs',
    'advanced-editor.browser.mjs',
    'icon-discovery.browser.mjs',
    'parity-patches.browser.mjs',
  ]) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--experimental-strip-types', `tests/${file}`], {
        cwd: root,
        windowsHide: true,
        stdio: 'inherit',
        env: {
          ...process.env,
          LUCK_FREEDOM_URL: base,
          LUCK_ADVANCED_URL: base,
          LUCK_ICON_URL: base,
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
