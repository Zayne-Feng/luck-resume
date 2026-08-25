import type { Worker as TesseractWorker } from 'tesseract.js';

type OcrRequest =
  | { type: 'initialize'; language: string; baseUrl: string }
  | { type: 'recognize'; image: Blob };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<OcrRequest>) => void) | null;
  postMessage: (value: unknown) => void;
};
let worker: TesseractWorker | undefined;

scope.onmessage = async ({ data }) => {
  try {
    if (data.type === 'initialize') {
      const { createWorker, OEM } = await import('tesseract.js');
      worker = await createWorker(data.language, OEM.LSTM_ONLY, {
        workerPath: new URL('/ocr/worker.min.js', data.baseUrl).href,
        corePath: new URL('/ocr/core/', data.baseUrl).href,
        langPath: new URL('/ocr/lang/', data.baseUrl).href,
        workerBlobURL: false,
        gzip: true,
        logger: ({ progress, status }) => scope.postMessage({ type: 'progress', progress, status }),
        errorHandler: (error: unknown) =>
          scope.postMessage({ type: 'error', message: String(error) }),
      });
      scope.postMessage({ type: 'ready' });
    } else {
      if (!worker) throw new Error('OCR worker is not initialized.');
      const result = await worker.recognize(data.image);
      scope.postMessage({
        type: 'result',
        text: result.data.text,
        confidence: result.data.confidence,
      });
    }
  } catch (error) {
    scope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
    await worker?.terminate();
  }
};
