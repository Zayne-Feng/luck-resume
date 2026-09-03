import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { publicConfiguration } from '../server/publicConfig.mjs';

test('public runtime requires a dedicated token and HTTPS origin with a valid local port', () => {
  const env = { LUCK_PUBLIC_ORIGIN: 'https://resume.lunelu.com', LUCK_PROXY_TOKEN: 'a'.repeat(64) };
  assert.deepEqual(publicConfiguration(env), {
    publicOrigin: env.LUCK_PUBLIC_ORIGIN,
    proxyToken: env.LUCK_PROXY_TOKEN,
    port: 5176,
  });
  for (const value of [
    '',
    'http://resume.lunelu.com',
    'https://user:pass@resume.lunelu.com',
    'https://resume.lunelu.com/path',
    'https://resume.lunelu.com/#fragment',
  ]) {
    assert.throws(() => publicConfiguration({ ...env, LUCK_PUBLIC_ORIGIN: value }));
  }
  for (const value of ['', 'short', 'a'.repeat(300), 'a'.repeat(32) + '\n']) {
    assert.throws(() => publicConfiguration({ ...env, LUCK_PROXY_TOKEN: value }));
  }
  for (const value of ['0', '65536', 'invalid', '5176.5']) {
    assert.throws(() => publicConfiguration({ ...env, PORT: value }));
  }
});

test('backend setup generates matching private secrets and preserves an existing configuration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'luck-backend-'));
  const script = fileURLToPath(new URL('../scripts/setup-backend.mjs', import.meta.url));
  try {
    const run = () =>
      spawnSync(process.execPath, [script], {
        cwd: directory,
        encoding: 'utf8',
        timeout: 10000,
        windowsHide: true,
      });
    let result = run();
    assert.equal(result.status, 0, result.stderr);
    const text = await readFile(join(directory, '.env.local'), 'utf8');
    const env = parseEnv(text);
    const configuration = publicConfiguration(env);
    const secrets = JSON.parse(
      await readFile(join(directory, '.cloudflared/worker-secrets.json'), 'utf8'),
    );
    assert.match(configuration.proxyToken, /^[a-f0-9]{64}$/);
    assert.deepEqual(secrets, { LUCK_PROXY_TOKEN: configuration.proxyToken });
    assert.ok(!result.stdout.includes(configuration.proxyToken));
    result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(join(directory, '.env.local'), 'utf8'), text);
    await writeFile(join(directory, '.env.local'), 'LUCK_PROXY_TOKEN=short\n');
    result = run();
    assert.notEqual(result.status, 0);
    assert.equal(await readFile(join(directory, '.env.local'), 'utf8'), 'LUCK_PROXY_TOKEN=short\n');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
