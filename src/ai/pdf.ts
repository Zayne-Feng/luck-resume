import { fileAttachment, type Attachment } from './client.ts';

export const MAX_AI_PDF_BYTES = 20 * 1024 * 1024;

export async function pdfAttachments(
  file: File,
  protocol: string,
  signal: AbortSignal,
): Promise<Attachment[]> {
  if (file.size > MAX_AI_PDF_BYTES) throw new Error('PDF 超过 AI 输入的 20 MiB 限制。');
  if (protocol !== 'chat')
    return [
      await fileAttachment(new Blob([await file.arrayBuffer()], { type: 'application/pdf' })),
    ];
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const abort = () => {
    void loading.destroy();
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const pdf = await loading.promise;
    if (pdf.numPages > 12) throw new Error('图像模式的 AI 输入最多支持 12 页 PDF。');
    const attachments: Attachment[] = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const page = await pdf.getPage(index);
      const original = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: Math.min(2, 1800 / Math.max(original.width, original.height)),
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
      attachments.push({
        mime: 'image/jpeg',
        data: canvas.toDataURL('image/jpeg', 0.86).split(',')[1],
      });
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }
    return attachments;
  } finally {
    signal.removeEventListener('abort', abort);
    await loading.destroy();
  }
}
