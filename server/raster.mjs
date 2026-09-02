import { launchBrowser } from './pdf.mjs';

let active = 0;
export async function rasterizeSvg(bytes, signal) {
  if (active >= 2) throw new Error('Image rendering is busy. Retry shortly.');
  active++;
  let browser;
  const combined = AbortSignal.any([signal, AbortSignal.timeout(20000)]);
  const cancel = () => {
    void browser?.close().catch(() => {});
  };
  combined.addEventListener('abort', cancel, { once: true });
  try {
    browser = await launchBrowser();
    combined.throwIfAborted();
    const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.setContent(
      `<body style="margin:0"><img src="data:image/svg+xml;base64,${bytes.toString('base64')}" style="display:block"></body>`,
    );
    const size = await page.locator('img').evaluate(async (image) => {
      await image.decode();
      const scale = Math.min(1, 1000 / Math.max(image.naturalWidth, image.naturalHeight));
      return {
        width: Math.max(1, Math.round(image.naturalWidth * scale)),
        height: Math.max(1, Math.round(image.naturalHeight * scale)),
      };
    });
    await page.setViewportSize(size);
    await page.locator('img').evaluate((image, size) => {
      image.style.width = `${size.width}px`;
      image.style.height = `${size.height}px`;
    }, size);
    combined.throwIfAborted();
    return await page.screenshot({ type: 'png', omitBackground: true });
  } finally {
    combined.removeEventListener('abort', cancel);
    await browser?.close().catch(() => {});
    active--;
  }
}
