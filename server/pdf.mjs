let active = 0;

export async function launchBrowser() {
  const { chromium } = await import('playwright');
  const channels = process.env.LUCK_PDF_BROWSER_CHANNEL
    ? [process.env.LUCK_PDF_BROWSER_CHANNEL]
    : process.platform === 'win32'
      ? ['msedge', 'chrome', undefined]
      : [undefined, 'chrome'];
  for (const channel of channels) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {}
  }
  throw new Error('Install a Chromium browser for direct PDF export.');
}

export async function handlePdfRequest({ path, method, body, signal }) {
  if (path !== '/api/pdf') return null;
  if (method !== 'POST')
    return Response.json({ error: 'Use POST for PDF export.' }, { status: 405 });
  if (typeof body?.html !== 'string' || !body.html.trim())
    return Response.json({ error: 'PDF HTML is required.' }, { status: 400 });
  if (Buffer.byteLength(body.html) > 24 * 1024 * 1024)
    return Response.json({ error: 'PDF HTML exceeds 24 MB.' }, { status: 413 });
  if (active >= 2)
    return Response.json(
      { error: 'PDF rendering is busy. Please retry shortly.' },
      { status: 429 },
    );
  if (signal.aborted) return Response.json({ error: 'PDF export cancelled.' }, { status: 499 });
  active++;
  let browser;
  const timeout = new AbortController();
  const combined = AbortSignal.any([signal, timeout.signal]);
  const timer = setTimeout(() => timeout.abort(), 90_000);
  const cancel = () => {
    void browser?.close().catch(() => {});
  };
  combined.addEventListener('abort', cancel, { once: true });
  try {
    browser = await launchBrowser();
    combined.throwIfAborted();
    const context = await browser.newContext({
      javaScriptEnabled: false,
      serviceWorkers: 'block',
      acceptDownloads: false,
    });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(45_000);
    await page.emulateMedia({ media: 'print', colorScheme: 'light' });
    await page.setContent(body.html, { waitUntil: 'load', timeout: 45_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, (image) => image.decode()));
    });
    combined.throwIfAborted();
    const bytes = await page.pdf({
      format: 'A4',
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: false,
      margin: { top: 0, left: 0, right: 0, bottom: 0 },
      tagged: true,
    });
    combined.throwIfAborted();
    return new Response(new Uint8Array(bytes), {
      headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return Response.json(
      {
        error: combined.aborted
          ? 'PDF export was cancelled or timed out.'
          : error?.message || 'PDF rendering failed.',
      },
      { status: combined.aborted ? 408 : 503 },
    );
  } finally {
    clearTimeout(timer);
    combined.removeEventListener('abort', cancel);
    await browser?.close().catch(() => {});
    active--;
  }
}
