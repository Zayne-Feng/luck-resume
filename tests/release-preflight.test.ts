import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('release preflight creates its manifest on a clean checkout', async () => {
  const temporaryRoot = resolve(tmpdir());
  const directory = await mkdtemp(join(temporaryRoot, 'luck-release-'));
  try {
    const files = {
      'index.html': '<link rel="canonical" href="https://resume.lunelu.com/">',
      _headers:
        "/*\n  Content-Security-Policy: script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'",
      'robots.txt': 'User-agent: *',
      'sitemap.xml': '<urlset />',
      'share.svg': '<svg />',
      'fonts/luck-wenkai.woff2': 'font fixture',
      'fonts/luck-xiaowei.woff2': 'font fixture',
      'ocr/worker.min.js': 'worker fixture',
      'ocr/lang/eng.traineddata.gz': 'language fixture',
      'ocr/lang/chi_sim.traineddata.gz': 'language fixture',
      'pdf/LICENSE': 'license fixture',
      'THIRD_PARTY_NOTICES.txt': 'Third-party notices fixture',
    };
    for (const [name, content] of Object.entries(files)) {
      const path = join(directory, 'dist', name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
    }
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('../scripts/release-preflight.mjs', import.meta.url))],
      { cwd: directory, encoding: 'utf8', timeout: 10000, windowsHide: true },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(
      await readFile(join(directory, '.cache/release-manifest.json'), 'utf8'),
    );
    assert.equal(manifest.target, 'https://resume.lunelu.com/');
    assert.ok(manifest.files.some((row: { path: string }) => row.path === 'index.html'));
  } finally {
    assert.equal(dirname(directory), temporaryRoot);
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  'runtime packaging excludes private configuration and non-runtime server files',
  {
    skip: process.platform !== 'win32',
  },
  async () => {
    const temporaryRoot = resolve(tmpdir());
    const directory = await mkdtemp(join(temporaryRoot, 'luck-package-'));
    try {
      const files = {
        'dist/index.html': '<html>Runtime fixture</html>',
        'dist/THIRD_PARTY_NOTICES.txt': 'Third-party notices fixture',
        'server/http.mjs': 'export const fixture = true;',
        'server/http.d.mts': 'export declare const fixture: boolean;',
        'server/.env': 'TOKEN=package-fixture',
        'server/debug.log': 'Private fixture output',
        '.env.local': 'LUCK_PROXY_TOKEN=private-fixture',
        '.cloudflared/luck-token.txt': 'private-connector-fixture',
        '.cloudflared/worker-secrets.json': '{"LUCK_PROXY_TOKEN":"private-fixture"}',
        'scripts/serve-build.mjs': 'export const fixture = true;',
        'scripts/serve-api.mjs': 'export const apiFixture = true;',
        'scripts/setup-backend.mjs': 'export const setupFixture = true;',
        'cloudflare/worker.mjs': 'export default { fetch() {} };',
        'wrangler.jsonc': '{ "name": "fixture" }',
        '.env.example': 'LUCK_PROXY_TOKEN=\n',
        'docs/runtime.md': '# Runtime fixture',
        'docs/tunnel.md': '# Tunnel fixture',
        'docs/licensing.md': '# Additional permissions fixture',
        'package.json': '{}',
        LICENSE: 'Copyright fixture. All rights reserved.',
        'pnpm-lock.yaml': 'lockfileVersion: 9',
      };
      for (const [name, content] of Object.entries(files)) {
        const path = join(directory, name);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, content);
      }
      const script = join(directory, 'scripts/package-local.ps1');
      await copyFile(new URL('../scripts/package-local.ps1', import.meta.url), script);
      const result = spawnSync(
        'powershell',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
        {
          cwd: directory,
          encoding: 'utf8',
          timeout: 20000,
          windowsHide: true,
        },
      );
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      const manifest = JSON.parse(
        await readFile(join(directory, '.cache/runtime-manifest.json'), 'utf8').then((text) =>
          text.replace(/^\uFEFF/, ''),
        ),
      );
      assert.ok(manifest.some((row: { path: string }) => row.path === 'server/http.mjs'));
      assert.ok(manifest.some((row: { path: string }) => row.path === 'server/http.d.mts'));
      assert.ok(manifest.some((row: { path: string }) => row.path === 'LICENSE'));
      for (const name of [
        'scripts/serve-api.mjs',
        'scripts/setup-backend.mjs',
        'cloudflare/worker.mjs',
        'wrangler.jsonc',
        '.env.example',
        'docs/tunnel.md',
      ]) {
        assert.ok(
          manifest.some((row: { path: string }) => row.path === name),
          name,
        );
      }
      assert.ok(
        manifest.some((row: { path: string }) => row.path === 'dist/THIRD_PARTY_NOTICES.txt'),
      );
      assert.equal(
        await readFile(join(directory, '.cache/runtime-package/LICENSE'), 'utf8'),
        files.LICENSE,
      );
      assert.equal(
        await readFile(join(directory, '.cache/runtime-package/docs/licensing.md'), 'utf8'),
        files['docs/licensing.md'],
      );
      assert.ok(
        !manifest.some(
          (row: { path: string }) =>
            (row.path !== '.env.example' && /(^|\/)\.env(?:\.|$)/.test(row.path)) ||
            /\.cloudflared|debug\.log/.test(row.path),
        ),
      );
      await assert.rejects(readFile(join(directory, '.cache/runtime-package/server/.env')), {
        code: 'ENOENT',
      });
    } finally {
      assert.equal(dirname(directory), temporaryRoot);
      await rm(directory, { recursive: true, force: true });
    }
  },
);
