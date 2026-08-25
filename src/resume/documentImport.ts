import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { MAX_IMPORT_FILE_BYTES } from './files.ts';
import { boundedCanvasSize, pdfTextToString } from './documentImportHelpers.ts';

export type DocumentImportMode = 'automatic' | 'text' | 'ocr';
export type OcrLanguage = 'eng' | 'chi_sim' | 'eng+chi_sim';
export interface ImportedPage {
  page: number;
  text: string;
  method: 'text' | 'ocr';
  confidence?: number;
}
export interface ImportProgress {
  phase: 'loading' | 'rendering' | 'initializing' | 'recognizing' | 'text';
  page?: number;
  completed: number;
  total: number;
  fraction?: number;
}
export interface PasswordRequest {
  incorrect: boolean;
  submit: (password: string) => void;
}

function abortError() {
  return new DOMException('Document import was cancelled.', 'AbortError');
}

export function isDocumentImportCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export class DocumentImportSession {
  readonly file: File;
  readonly kind: 'pdf' | 'image';
  pageCount = 0;
  private readonly controller = new AbortController();
  private loadingTask?: PDFDocumentLoadingTask;
  private pdf?: PDFDocumentProxy;
  private ocr?: Worker;
  private renderTask?: { cancel: () => void };
  private bitmap?: ImageBitmap;
  private image?: HTMLImageElement;
  private imageUrl?: string;
  private extracting = false;

  constructor(file: File) {
    if (file.size > MAX_IMPORT_FILE_BYTES) throw new Error('文件超过 64 MB，请选择较小的文件。');
    if (!file.size) throw new Error('文件为空，请选择其他文件。');
    if (/\.pdf$/i.test(file.name)) this.kind = 'pdf';
    else if (/\.(png|jpe?g|webp)$/i.test(file.name)) this.kind = 'image';
    else throw new Error('请选择 PDF、PNG、JPEG 或 WebP 文件。');
    this.file = file;
  }

  private check() {
    if (this.controller.signal.aborted) throw abortError();
  }

  private wait<T>(promise: Promise<T>): Promise<T> {
    this.check();
    return new Promise((resolve, reject) => {
      const abort = () => reject(abortError());
      this.controller.signal.addEventListener('abort', abort, { once: true });
      promise
        .then(resolve, reject)
        .finally(() => this.controller.signal.removeEventListener('abort', abort));
    });
  }

  async load(
    onPassword: (request: PasswordRequest) => void,
    onProgress: (progress: ImportProgress) => void,
  ): Promise<void> {
    this.check();
    if (this.kind === 'image') {
      if (typeof createImageBitmap === 'function') {
        const bitmapPromise = createImageBitmap(this.file);
        bitmapPromise.then(
          (bitmap) => {
            if (this.controller.signal.aborted) bitmap.close();
          },
          () => {},
        );
        this.bitmap = await this.wait(bitmapPromise);
      } else {
        this.imageUrl = URL.createObjectURL(this.file);
        this.image = new Image();
        this.image.src = this.imageUrl;
        await this.wait(this.image.decode());
      }
      this.check();
      this.pageCount = 1;
      return;
    }
    const [pdfjs, workerUrl] = await this.wait(
      Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]),
    );
    this.check();
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
    const data = new Uint8Array(await this.wait(this.file.arrayBuffer()));
    this.check();
    this.loadingTask = pdfjs.getDocument({
      data,
      cMapUrl: new URL('/pdf/cmaps/', location.href).href,
      cMapPacked: true,
      standardFontDataUrl: new URL('/pdf/standard_fonts/', location.href).href,
      wasmUrl: new URL('/pdf/wasm/', location.href).href,
    });
    this.loadingTask.onPassword = (submit: (password: string) => void, reason: number) => {
      if (!this.controller.signal.aborted) onPassword({ incorrect: reason === 2, submit });
    };
    this.loadingTask.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      if (!this.controller.signal.aborted)
        onProgress({
          phase: 'loading',
          completed: 0,
          total: 0,
          fraction: total ? loaded / total : undefined,
        });
    };
    this.pdf = await this.wait(this.loadingTask.promise);
    this.check();
    this.pageCount = this.pdf.numPages;
  }

  private async startOcr(
    language: OcrLanguage,
    onProgress: (fraction: number) => void,
  ): Promise<void> {
    this.check();
    this.ocr = new Worker(new URL('./documentOcr.worker.ts', import.meta.url), { type: 'module' });
    await this.ocrRequest(
      { type: 'initialize', language, baseUrl: location.origin },
      'ready',
      onProgress,
    );
  }

  private ocrRequest(
    request: unknown,
    expected: 'ready' | 'result',
    onProgress: (fraction: number) => void,
  ): Promise<{ text?: string; confidence?: number }> {
    this.check();
    const worker = this.ocr!;
    return this.wait(
      new Promise((resolve, reject) => {
        const finish = () => {
          worker.removeEventListener('message', message);
          worker.removeEventListener('error', error);
        };
        const error = (event: ErrorEvent) => {
          finish();
          reject(new Error(event.message || 'OCR worker failed.'));
        };
        const message = (
          event: MessageEvent<{
            type: string;
            message?: string;
            progress?: number;
            text?: string;
            confidence?: number;
          }>,
        ) => {
          if (event.data.type === 'progress')
            onProgress(Math.max(0, Math.min(1, event.data.progress ?? 0)));
          else if (event.data.type === 'error') {
            finish();
            reject(new Error(event.data.message || 'OCR failed.'));
          } else if (event.data.type === expected) {
            finish();
            resolve(event.data);
          }
        };
        worker.addEventListener('message', message);
        worker.addEventListener('error', error);
        worker.postMessage(request);
      }),
    );
  }

  private async imageBlob(pageNumber: number): Promise<Blob> {
    const canvas = document.createElement('canvas');
    let cleanup = () => {};
    try {
      if (this.pdf) {
        const page = await this.wait(this.pdf.getPage(pageNumber));
        cleanup = () => page.cleanup();
        const viewport = page.getViewport({ scale: 1 });
        const size = boundedCanvasSize(viewport.width, viewport.height);
        canvas.width = size.width;
        canvas.height = size.height;
        this.renderTask = page.render({
          canvas,
          viewport: page.getViewport({ scale: size.scale }),
          background: '#ffffff',
        });
        await this.wait((this.renderTask as ReturnType<typeof page.render>).promise);
        this.renderTask = undefined;
      } else {
        const image = this.bitmap ?? this.image;
        if (!image) throw new Error('Image is not loaded.');
        const size = boundedCanvasSize(
          this.bitmap?.width ?? this.image!.naturalWidth,
          this.bitmap?.height ?? this.image!.naturalHeight,
          1,
        );
        canvas.width = size.width;
        canvas.height = size.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas is unavailable.');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
      }
      this.check();
      return await this.wait(
        new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Unable to render page image.'));
          }, 'image/png'),
        ),
      );
    } finally {
      cleanup();
      canvas.width = canvas.height = 0;
    }
  }

  async extract(
    pages: number[],
    mode: DocumentImportMode,
    language: OcrLanguage,
    onProgress: (progress: ImportProgress) => void,
  ): Promise<ImportedPage[]> {
    this.check();
    if (this.extracting) throw new Error('Document extraction is already running.');
    if (
      !pages.length ||
      pages.some((page) => !Number.isSafeInteger(page) || page < 1 || page > this.pageCount)
    )
      throw new Error('Invalid page selection.');
    if (this.kind === 'image' && mode === 'text')
      throw new Error('图片没有 PDF 文字层，请选择 OCR。');
    this.extracting = true;
    const selected = [...new Set(pages)].sort((left, right) => left - right);
    const useOcr = mode === 'ocr' || this.kind === 'image';
    let completed = 0;
    const progress = (phase: ImportProgress['phase'], page?: number, fraction?: number) => {
      if (!this.controller.signal.aborted)
        onProgress({ phase, page, completed, total: selected.length, fraction });
    };
    try {
      if (useOcr) {
        progress('initializing');
        await this.startOcr(language, (fraction) => progress('initializing', undefined, fraction));
      }
      const result: ImportedPage[] = [];
      for (const pageNumber of selected) {
        this.check();
        if (useOcr) {
          progress('rendering', pageNumber);
          const image = await this.imageBlob(pageNumber);
          progress('recognizing', pageNumber, 0);
          const output = await this.ocrRequest({ type: 'recognize', image }, 'result', (fraction) =>
            progress('recognizing', pageNumber, fraction),
          );
          result.push({
            page: pageNumber,
            text: output.text ?? '',
            method: 'ocr',
            confidence: output.confidence,
          });
        } else {
          progress('text', pageNumber);
          const page = await this.wait(this.pdf!.getPage(pageNumber));
          try {
            const content = await this.wait(page.getTextContent());
            result.push({
              page: pageNumber,
              text: pdfTextToString(content.items.filter((item) => 'str' in item)),
              method: 'text',
            });
          } finally {
            page.cleanup();
          }
        }
        completed++;
        progress(useOcr ? 'recognizing' : 'text', pageNumber, 1);
      }
      return result;
    } finally {
      this.ocr?.terminate();
      this.ocr = undefined;
      this.extracting = false;
    }
  }

  dispose(): void {
    if (this.controller.signal.aborted) return;
    this.controller.abort();
    this.renderTask?.cancel();
    this.ocr?.terminate();
    this.ocr = undefined;
    void this.loadingTask?.destroy().catch(() => {});
    this.bitmap?.close();
    if (this.image) this.image.src = '';
    if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
  }
}
