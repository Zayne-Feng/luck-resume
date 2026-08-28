export type LongExportFormat = 'png' | 'pdf';

export const MAX_CANVAS_EDGE = 8192;
export const MAX_CANVAS_AREA = 16_000_000;
export const MAX_PDF_POINTS = 14400;
const MAX_TOTAL_PIXELS = 64_000_000;

export interface ExportTile {
  pixelTop: number;
  pixelHeight: number;
}

export function planLongExport(width: number, height: number, format: LongExportFormat, scale = 2) {
  if (![width, height, scale].every(Number.isFinite) || width <= 0 || height <= 0)
    throw new Error('无法测量简历尺寸，请重新打开简历后重试。');
  if (scale < 1 || scale > 4) throw new Error('导出倍率须在 1 至 4 之间。');
  const pixelWidth = Math.ceil(width * scale);
  const pixelHeight = Math.ceil(height * scale);
  const pdfWidth = width * 0.75;
  const pdfHeight = height * 0.75;
  if (format === 'pdf' && Math.max(pdfWidth, pdfHeight) > MAX_PDF_POINTS)
    throw new Error('内容超过单页 PDF 的长度上限，请使用 A4 打印或独立 HTML 导出。');
  if (pixelWidth > MAX_CANVAS_EDGE || pixelWidth * pixelHeight > MAX_TOTAL_PIXELS)
    throw new Error('内容超过长图导出的内存上限，请使用 A4 打印或独立 HTML 导出。');
  const tileHeight = Math.min(MAX_CANVAS_EDGE, Math.floor(MAX_CANVAS_AREA / pixelWidth));
  const tiles: ExportTile[] = [];
  for (let pixelTop = 0; pixelTop < pixelHeight; pixelTop += tileHeight)
    tiles.push({ pixelTop, pixelHeight: Math.min(tileHeight, pixelHeight - pixelTop) });
  return { scale, width, height, pixelWidth, pixelHeight, pdfWidth, pdfHeight, tiles };
}

export function longExportFilename(
  title: string,
  format: LongExportFormat,
  index: number,
  count: number,
): string {
  const stem =
    title
      .trim()
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
      .slice(0, 120) || 'resume';
  const part =
    count > 1
      ? `-part-${String(index + 1).padStart(2, '0')}-of-${String(count).padStart(2, '0')}`
      : '';
  return `${stem}-long${part}.${format}`;
}
