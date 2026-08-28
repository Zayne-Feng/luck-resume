import documentCss from '../styles/resume.css?inline';
import tokenCss from '../styles/tokens.css?inline';
import timelineCss from '../styles/timeline.css?inline';
import advancedRichTextCss from './advanced-rich-text.css?inline';
import { ensureResumeFont, fontAssetPath, RESUME_FONT_FAMILIES } from './fonts.ts';
import type { ResumeDocument } from './model.ts';
import { paginateResume } from './pagination.ts';

function escapeText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
function encodeBytes(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32768)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  return btoa(chunks.join(''));
}
export async function buildPrintHtml(doc: ResumeDocument, signal?: AbortSignal): Promise<string> {
  const source = document.querySelector<HTMLElement>('.pagination-source .resume-document');
  if (!source || source.dataset.documentId !== doc.id) throw new Error('请先打开需要导出的简历。');
  const original = source.cloneNode(true) as HTMLElement;
  await ensureResumeFont(doc.appearance.font);
  signal?.throwIfAborted();
  const host = document.createElement('div');
  host.className = 'pagination-source';
  host.setAttribute('aria-hidden', 'true');
  document.body.append(host);
  try {
    host.append(original);
    await Promise.all(Array.from(original.querySelectorAll('img'), (image) => image.decode()));
    const response = await fetch(fontAssetPath(doc.appearance.font), { signal });
    if (!response.ok) throw new Error('字体文件未能读取，请重试。');
    const font = encodeBytes(new Uint8Array(await response.arrayBuffer()));
    const pages = paginateResume(original, host);
    const family = RESUME_FONT_FAMILIES[doc.appearance.font];
    const css = `${tokenCss}\n@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:400;}\n*{box-sizing:border-box}body{margin:0;background:#eee;-webkit-font-smoothing:antialiased}h1,h2,h3,p{margin:0}h1,h2,h3{min-width:0;overflow-wrap:break-word}h1,h2{text-wrap:balance}${documentCss}\n${advancedRichTextCss}\n.resume-pages{align-items:center;padding:24px 0}.resume-page{box-shadow:0 2px 12px #0002}@page{size:A4;margin:0}@media print{body{background:white}.resume-pages{display:block;padding:0}.resume-page{break-after:page;break-inside:avoid;box-shadow:none}.resume-page:last-child{break-after:auto}.resume-page::after,.resume-empty{display:none}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}`;
    signal?.throwIfAborted();
    return `<!doctype html><html lang="${doc.appearance.language === 'en' ? 'en' : 'zh-CN'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeText(doc.title)}</title><style>${css}\n${timelineCss}</style></head><body><main class="resume-pages">${pages.map((page) => page.outerHTML).join('')}</main></body></html>`;
  } finally {
    host.remove();
  }
}

export async function downloadPrintHtml(doc: ResumeDocument): Promise<void> {
  const html = await buildPrintHtml(doc);
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(doc.title || 'resume').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')}.html`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadDirectPdf(doc: ResumeDocument, signal?: AbortSignal): Promise<void> {
  const html = await buildPrintHtml(doc, signal);
  const response = await fetch('/api/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html }),
    signal,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || 'PDF export failed.');
  }
  const bytes = await response.blob();
  signal?.throwIfAborted();
  const url = URL.createObjectURL(bytes);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${(doc.title || 'resume').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')}.pdf`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
