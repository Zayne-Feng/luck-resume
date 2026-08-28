import { ensureResumeFont, fontAssetPath, RESUME_FONT_FAMILIES } from './fonts.ts';
import type { ResumeDocument } from './model.ts';
import { automaticOnePage } from './automaticOnePage.ts';
import { longExportFilename, planLongExport, type LongExportFormat } from './longExportGeometry.ts';

export interface LongExportProgress {
  stage: 'preparing' | 'rendering' | 'encoding' | 'complete';
  completed: number;
  total: number;
}

export interface LongExportFile {
  filename: string;
  blob: Blob;
}

export interface LongExportResult {
  files: LongExportFile[];
  width: number;
  height: number;
  scale: number;
  segmented: boolean;
}

export interface LongExportOptions {
  signal?: AbortSignal;
  onProgress?: (progress: LongExportProgress) => void;
  scale?: number;
}

let exporting = false;

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
}

function encodeBytes(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32768)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  return btoa(chunks.join(''));
}

async function selectedFontCss(font: ResumeDocument['appearance']['font'], signal?: AbortSignal) {
  const response = await fetch(fontAssetPath(font), { signal, credentials: 'same-origin' });
  if (!response.ok) throw new Error('字体文件未能读取，请重试。');
  const encoded = encodeBytes(new Uint8Array(await response.arrayBuffer()));
  checkAbort(signal);
  return `@font-face{font-family:'${RESUME_FONT_FAMILIES[font]}';src:url(data:font/woff2;base64,${encoded}) format('woff2');font-weight:100 900;font-style:normal;font-display:block;}`;
}

function blobDataUrl(blob: Blob, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const abort = () => reader.abort();
    reader.onload = () => {
      cleanup();
      resolve(String(reader.result));
    };
    reader.onerror = () => {
      cleanup();
      reject(new Error('无法读取导出图片。'));
    };
    reader.onabort = () => {
      cleanup();
      reject(new DOMException('Export cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      cleanup();
      reject(new DOMException('Export cancelled', 'AbortError'));
      return;
    }
    reader.readAsDataURL(blob);
  });
}

async function prepareImages(root: HTMLElement, signal?: AbortSignal) {
  for (const image of root.querySelectorAll('img')) {
    checkAbort(signal);
    const source = image.getAttribute('src') ?? '';
    if (!source) throw new Error('简历中有无法读取的图片，请重新选择图片后重试。');
    image.loading = 'eager';
    image.removeAttribute('srcset');
    if (!source.startsWith('data:')) {
      const url = new URL(source, window.location.href);
      if (url.origin !== window.location.origin)
        throw new Error('导出图片须来自本地文件或当前站点，请重新选择图片。');
      const response = await fetch(url, { signal, credentials: 'same-origin' });
      if (!response.ok) throw new Error('简历图片未能读取，请重新选择图片后重试。');
      image.src = await blobDataUrl(await response.blob(), signal);
    }
    await image.decode();
    checkAbort(signal);
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error('简历图片未能解码，请重新选择图片后重试。');
  }
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error('浏览器无法生成长图，请使用 A4 打印或独立 HTML 导出。')),
      'image/png',
    ),
  );
}

export async function exportLongResume(
  doc: ResumeDocument,
  format: LongExportFormat,
  options: LongExportOptions = {},
): Promise<LongExportResult> {
  checkAbort(options.signal);
  if (exporting) throw new Error('另一项长图导出正在处理，请等待完成。');
  const source = document.querySelector<HTMLElement>('.pagination-source .resume-document');
  if (!source || source.dataset.documentId !== doc.id) throw new Error('请先打开需要导出的简历。');
  let original = source.cloneNode(true) as HTMLElement;
  const font = doc.appearance.font;
  const title = doc.title;
  const host = document.createElement('div');
  const viewport = document.createElement('div');
  exporting = true;
  const progress = (stage: LongExportProgress['stage'], completed = 0, total = 1) =>
    options.onProgress?.({ stage, completed, total });
  try {
    progress('preparing');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText =
      'position:fixed;left:-100000px;top:0;pointer-events:none;visibility:visible;contain:layout style;';
    viewport.style.cssText =
      'position:relative;overflow:hidden;background:#fff;box-sizing:border-box;';
    original.classList.remove('resume-page');
    Object.assign(original.style, {
      position: 'relative',
      left: '0px',
      top: '0px',
      height: 'auto',
      minHeight: '0px',
      maxHeight: 'none',
      boxSizing: 'border-box',
      overflow: 'visible',
      transform: 'none',
      visibility: 'visible',
      backgroundColor: '#fff',
      colorScheme: 'light',
    });
    viewport.append(original);
    host.append(viewport);
    document.body.append(host);
    await ensureResumeFont(font);
    checkAbort(options.signal);
    await prepareImages(original, options.signal);
    if (doc.appearance.automaticOnePage) {
      const fitted = automaticOnePage(original, host);
      if (fitted.page) {
        original.replaceWith(fitted.page);
        original = fitted.page;
        original.classList.remove('resume-page');
        original.style.height = '297mm';
      }
    }
    const fontEmbedCSS = await selectedFontCss(font, options.signal);
    const bounds = original.getBoundingClientRect();
    const width = bounds.width;
    const height = Math.max(bounds.height, original.scrollHeight);
    const plan = planLongExport(width, height, format, options.scale);
    const { toCanvas } = await import('html-to-image');
    checkAbort(options.signal);
    const pdf =
      format === 'pdf'
        ? new (await import('jspdf')).jsPDF({
            orientation: plan.pdfHeight >= plan.pdfWidth ? 'portrait' : 'landscape',
            unit: 'pt',
            format: [plan.pdfWidth, plan.pdfHeight],
            compress: true,
            putOnlyUsedFonts: true,
          })
        : null;
    pdf?.setProperties({ title });
    const files: LongExportFile[] = [];
    for (const [index, tile] of plan.tiles.entries()) {
      checkAbort(options.signal);
      progress('rendering', index, plan.tiles.length);
      const tileHeight = tile.pixelHeight / plan.scale;
      viewport.style.width = `${width}px`;
      viewport.style.height = `${tileHeight}px`;
      original.style.top = `${-tile.pixelTop / plan.scale}px`;
      const canvas = await toCanvas(viewport, {
        width,
        height: tileHeight,
        canvasWidth: plan.pixelWidth,
        canvasHeight: tile.pixelHeight,
        pixelRatio: 1,
        fontEmbedCSS,
        backgroundColor: '#fff',
        skipAutoScale: true,
        fetchRequestInit: { signal: options.signal, credentials: 'same-origin' },
        onImageErrorHandler: () => {
          throw new Error('简历图片渲染失败，请重新选择图片后重试。');
        },
      });
      try {
        checkAbort(options.signal);
        if (canvas.width !== plan.pixelWidth || canvas.height !== tile.pixelHeight)
          throw new Error('浏览器无法保持长图清晰度，请使用 A4 打印或独立 HTML 导出。');
        progress('encoding', index, plan.tiles.length);
        if (pdf) {
          pdf.addImage(
            canvas,
            'PNG',
            0,
            (tile.pixelTop / plan.scale) * 0.75,
            plan.pdfWidth,
            tileHeight * 0.75,
            undefined,
            'FAST',
          );
        } else {
          files.push({
            filename: longExportFilename(title, 'png', index, plan.tiles.length),
            blob: await canvasBlob(canvas),
          });
        }
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
      checkAbort(options.signal);
    }
    if (pdf)
      files.push({ filename: longExportFilename(title, 'pdf', 0, 1), blob: pdf.output('blob') });
    checkAbort(options.signal);
    progress('complete', plan.tiles.length, plan.tiles.length);
    return { files, width, height, scale: plan.scale, segmented: files.length > 1 };
  } finally {
    host.remove();
    exporting = false;
  }
}
