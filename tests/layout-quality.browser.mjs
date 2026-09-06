import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
try {
  const page = await browser.newPage();
  await page.goto(process.env.LUCK_PARITY_URL || 'http://127.0.0.1:5184');
  const result = await page.evaluate(async () => {
    const { inspectLayoutQuality } = await import('/src/resume/layoutQuality.ts');
    const initialHosts = document.querySelectorAll('.pagination-source').length;
    const makePage = (html) => {
      const paper = document.createElement('article');
      paper.className = 'resume-document resume-page';
      paper.style.cssText =
        'box-sizing:border-box;width:794px;height:1123px;min-height:1123px;padding:40px;font-size:16px;line-height:1.5';
      paper.innerHTML = html;
      return paper;
    };
    const first = makePage(
      '<div style="zoom:0.5"><section class="resume-section" data-section-id="body"><div class="resume-entry" data-entry-id="entry"><p style="font-size:16px">Meaningful body text for physical print measurement.</p><sup style="font-size:4px">1</sup></div></section><section class="resume-section" data-section-id="orphan"><h2 style="font-size:16px">Orphan heading</h2></section></div>',
    );
    first.dataset.onePageScale = '0.5';
    const second = makePage(
      '<section class="resume-section" data-section-id="next"><div class="resume-entry"><p>Another meaningful body paragraph on the final page.</p></div></section>',
    );
    const measured = inspectLayoutQuality([first, second]);
    second.querySelector('section').dataset.breakBefore = 'true';
    const intentional = inspectLayoutQuality([first, second]);
    const fragments = makePage(
      '<div style="zoom:0.5"><section class="resume-section" data-section-id="body"><div class="resume-entry" data-entry-id="short"><div class="resume-rich" style="font-size:16px"><ul><li><strong>完成</strong><em>项目</em>交付<sup style="font-size:2px">1</sup></li><li>团队协作</li></ul></div><div class="resume-entry-meta" style="font-size:3px">Decorative metadata is excluded</div><small style="font-size:2px">Decorative label is excluded</small></div></section></div>',
    );
    fragments.dataset.onePageScale = '0.5';
    const fragmented = inspectLayoutQuality([fragments]);
    const contactMetadata = inspectLayoutQuality([
      makePage(
        '<header><div class="resume-contacts" style="font-size:3px">contact-metadata@example.com</div><figure class="resume-contributions" style="font-size:3px">Contribution calendar metadata</figure></header><section class="resume-section"><div class="resume-rich"><p style="font-size:16px">Meaningful body content remains readable.</p></div></section>',
      ),
    ]);
    return {
      measured,
      intentional,
      fragmented,
      contactMetadata,
      detached: !first.isConnected && !second.isConnected,
      leakedHosts: document.querySelectorAll('.pagination-source').length,
      initialHosts,
    };
  });
  assert.equal(result.measured.scale, 0.5);
  assert.equal(result.measured.smallestTextPt, 6);
  assert(
    result.measured.issues.some(
      (issue) => issue.kind === 'small-text' && issue.target.entryId === 'entry',
    ),
  );
  assert(
    result.measured.issues.some(
      (issue) => issue.kind === 'orphan-heading' && issue.target.sectionId === 'orphan',
    ),
  );
  assert(result.measured.issues.some((issue) => issue.kind === 'sparse-page'));
  assert(!result.intentional.issues.some((issue) => issue.kind === 'sparse-page'));
  assert(result.detached);
  assert.equal(result.fragmented.smallestTextPt, 6);
  assert(
    result.fragmented.issues.some(
      (issue) => issue.kind === 'small-text' && issue.target.entryId === 'short',
    ),
  );
  assert.equal(result.leakedHosts, result.initialHosts);
  assert.equal(result.contactMetadata.smallestTextPt, 12);
  assert.equal(
    result.contactMetadata.issues.some((issue) => issue.kind === 'small-text'),
    false,
  );
  console.log('Layout quality browser checks passed.');
} finally {
  await browser.close();
}
