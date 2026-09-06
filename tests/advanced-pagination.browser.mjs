import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.LUCK_FREEDOM_URL || 'http://127.0.0.1:5199';
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(base);
  await page.waitForSelector('.pagination-source .resume-document', { state: 'attached' });
  const result = await page.evaluate(async () => {
    await document.fonts.ready;
    const { paginateResume } = await import('/src/resume/pagination.ts');
    const source = document.querySelector('.pagination-source .resume-document').cloneNode(true);
    const section = source.querySelector('.resume-section');
    section.querySelector(':scope > h2')?.remove();
    section.classList.add('resume-section-no-title');
    source.querySelectorAll('.resume-section').forEach((other) => {
      if (other !== section) other.remove();
    });
    const entry = section.querySelector('.resume-entry');
    section.querySelectorAll('.resume-entry').forEach((other) => {
      if (other !== entry) other.remove();
    });
    const body = entry.querySelector('.resume-rich');
    body.replaceChildren();
    const heading = document.createElement('h2');
    heading.textContent = 'Unique body heading';
    const quote = document.createElement('blockquote');
    const code = document.createElement('pre');
    code.textContent = Array.from(
      { length: 240 },
      (_, index) => `line-${index.toString().padStart(3, '0')} = ${'longword'.repeat(8)}`,
    ).join('\n');
    code.style.whiteSpace = 'pre-wrap';
    code.style.overflowWrap = 'anywhere';
    quote.append(code);
    body.append(heading, quote);
    const host = document.createElement('div');
    host.className = 'pagination-source';
    document.body.append(host);
    host.append(source);
    try {
      const pages = paginateResume(source, host);
      host.append(...pages);
      const headingCount = pages.reduce(
        (count, page) =>
          count +
          [...page.querySelectorAll('h2')].filter((h) => h.textContent === 'Unique body heading')
            .length,
        0,
      );
      const codeText = pages
        .flatMap((page) => [...page.querySelectorAll('pre')].map((pre) => pre.textContent))
        .join('');
      const bodyHeading = pages[0].querySelector('.resume-rich h2');
      return {
        pages: pages.length,
        headingCount,
        completeCode: codeText === code.textContent,
        bodyHeadingBorder: getComputedStyle(bodyHeading).borderTopWidth,
        bounds: pages.every((p) => p.scrollWidth <= p.clientWidth + 1),
      };
    } finally {
      host.remove();
    }
  });
  assert.ok(result.pages > 1);
  assert.equal(result.headingCount, 1, 'Body headings must not be repeated as section headings');
  assert.equal(result.completeCode, true, JSON.stringify(result));
  assert.equal(
    result.bodyHeadingBorder,
    '0px',
    'Body headings must not inherit decorative module borders',
  );
  assert.equal(result.bounds, true);
  console.log(
    'PASS: advanced body headings remain unique and long quoted code paginates without truncation',
  );
} finally {
  await browser.close();
}
