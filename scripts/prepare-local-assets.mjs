import { cp, mkdir, readdir, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ocr = dirname(require.resolve('tesseract.js/package.json'));
const core = dirname(
  createRequire(resolve(ocr, 'package.json')).resolve('tesseract.js-core/package.json'),
);
const pdf = dirname(require.resolve('pdfjs-dist/package.json'));
await mkdir(resolve(root, 'public/ocr/core'), { recursive: true });
await copyFile(resolve(ocr, 'dist/worker.min.js'), resolve(root, 'public/ocr/worker.min.js'));
await copyFile(resolve(ocr, 'LICENSE.md'), resolve(root, 'public/ocr/tesseract-LICENSE.md'));
for (const file of await readdir(core)) {
  if (file.endsWith('.wasm') || file.endsWith('.wasm.js') || /^LICENSE/.test(file))
    await copyFile(resolve(core, file), resolve(root, 'public/ocr/core', file));
}
for (const directory of ['cmaps', 'standard_fonts', 'wasm'])
  await cp(resolve(pdf, directory), resolve(root, 'public/pdf', directory), { recursive: true });
await copyFile(resolve(pdf, 'LICENSE'), resolve(root, 'public/pdf/LICENSE'));
console.log('Prepared same-origin OCR and PDF assets.');
