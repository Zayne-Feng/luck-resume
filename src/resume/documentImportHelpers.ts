export interface PdfTextPart {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
  width?: number;
}

export function parseDocumentPages(value: string, pageCount: number): number[] {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw new Error('Invalid page count.');
  const input = value.trim();
  if (input === 'all') return Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages = new Set<number>();
  for (const part of input.split(',')) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part.trim());
    if (!match) throw new Error('Invalid page selection.');
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 1 ||
      end < start ||
      end > pageCount
    )
      throw new Error('Invalid page range.');
    for (let page = start; page <= end; page++) pages.add(page);
  }
  return [...pages].sort((left, right) => left - right);
}

export function pdfTextToString(parts: PdfTextPart[]): string {
  let result = '';
  let previous: PdfTextPart | undefined;
  for (const part of parts) {
    if (previous && result && !result.endsWith('\n') && part.str) {
      const before = previous.transform;
      const current = part.transform;
      if (before && current) {
        const height = Math.max(Math.hypot(current[2], current[3]), 1);
        const baselineChanged = Math.abs(current[5] - before[5]) > height * 0.5;
        const gap = current[4] - before[4] - (previous.width ?? 0);
        if (baselineChanged) result += '\n';
        else if (gap > height * 0.12 && !/\s$/.test(result) && !/^\s/.test(part.str)) result += ' ';
      } else if (!/\s$/.test(result) && !/^\s/.test(part.str)) result += ' ';
    }
    result += part.str;
    if (part.hasEOL && !result.endsWith('\n')) result += '\n';
    previous = part;
  }
  return result.replace(/\n+$/, '');
}

export function boundedCanvasSize(width: number, height: number, requestedScale = 2) {
  if (![width, height, requestedScale].every((value) => Number.isFinite(value) && value > 0))
    throw new Error('Invalid image dimensions.');
  const scale = Math.min(
    requestedScale,
    4096 / width,
    4096 / height,
    Math.sqrt(12_000_000 / width / height),
  );
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
    scale,
  };
}
