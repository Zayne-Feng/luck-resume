import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { publicConfiguration } from '../server/publicConfig.mjs';

try {
  const file = resolve('.env.local');
  let configuration;
  try {
    configuration = publicConfiguration(parseEnv(await readFile(file, 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    configuration = publicConfiguration({
      LUCK_PUBLIC_ORIGIN: 'https://resume.lunelu.com',
      LUCK_PROXY_TOKEN: randomBytes(32).toString('hex'),
      PORT: '5176',
    });
    await writeFile(
      file,
      `LUCK_PUBLIC_ORIGIN=${configuration.publicOrigin}\nLUCK_PROXY_TOKEN=${configuration.proxyToken}\nPORT=${configuration.port}\n`,
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
  }
  await mkdir(resolve('.cloudflared'), { recursive: true });
  await writeFile(
    resolve('.cloudflared/worker-secrets.json'),
    JSON.stringify({ LUCK_PROXY_TOKEN: configuration.proxyToken }, null, 2) + '\n',
    { encoding: 'utf8', mode: 0o600 },
  );
  console.log('Backend configuration is ready. Private files: .env.local and .cloudflared/.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
