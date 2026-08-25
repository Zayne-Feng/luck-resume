# Local OCR resources

`worker.min.js` is distributed from Tesseract.js 7.0.0. Its license is included
as `tesseract-LICENSE.md`. The corresponding Tesseract.js Core 7.0.0 JavaScript,
WebAssembly variants and license are copied into `core/` by
`scripts/prepare-local-assets.mjs`.

The language data uses the official `tesseract-ocr/tessdata_fast` repository at
commit `87416418657359cb625c412a48b6e1d6d41c29bd`:

- `eng.traineddata` (4,113,088 bytes before gzip)
- `chi_sim.traineddata` (2,469,156 bytes before gzip)

Both files are compressed with gzip and distributed in `lang/`. They are
licensed under Apache 2.0; the complete text is `tessdata-LICENSE.txt`.
They are LSTM models and run with `OEM.LSTM_ONLY`.

All worker, engine and language URLs resolve to the application origin. No
document upload, OCR API key or third-party OCR request is used.
