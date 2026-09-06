import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve('dist');
const files = [];
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    assert.ok(
      !/^(?:\.env(?:\..*)?|\.git|node_modules|test-results|\.cache)$/i.test(entry.name),
      `Unexpected build entry: ${entry.name}`,
    );
    if (entry.isDirectory()) await scan(path);
    else {
      assert.ok(
        !/\.(?:map|log|pdf|jsonl|pem|key)$/i.test(entry.name),
        `Unexpected build file: ${entry.name}`,
      );
      const data = await readFile(path);
      assert.ok(
        data.length < 25 * 1024 * 1024,
        `Asset exceeds local release size policy: ${entry.name}`,
      );
      files.push({
        path: relative(root, path).replaceAll('\\', '/'),
        bytes: data.length,
        sha256: createHash('sha256').update(data).digest('hex'),
      });
    }
  }
}
await scan(root);
for (const name of [
  'index.html',
  '_headers',
  'robots.txt',
  'sitemap.xml',
  'share.svg',
  'fonts/luck-wenkai.woff2',
  'fonts/luck-xiaowei.woff2',
  'ocr/worker.min.js',
  'ocr/lang/eng.traineddata.gz',
  'ocr/lang/chi_sim.traineddata.gz',
  'pdf/LICENSE',
  'THIRD_PARTY_NOTICES.txt',
])
  assert.ok((await stat(resolve(root, name))).size > 0, `Missing release asset: ${name}`);
const headers = await readFile(resolve(root, '_headers'), 'utf8');
assert.match(headers, /wasm-unsafe-eval/);
assert.match(headers, /worker-src 'self'/);
assert.match(
  await readFile(resolve(root, 'index.html'), 'utf8'),
  /https:\/\/resume\.lunelu\.com\//,
);
await mkdir(resolve('.cache'), { recursive: true });
await writeFile(
  resolve('.cache/release-manifest.json'),
  JSON.stringify({ target: 'https://resume.lunelu.com/', files }, null, 2),
);
console.log(
  `Local release preflight passed: ${files.length} files, ${files.reduce((sum, file) => sum + file.bytes, 0)} bytes. No files published.`,
);
