# Data Formats and Backups

## Editable JSON

Native files use a `luck-resume` envelope with format version `1`. The resume contains an identity, creation/update fields, profile, sections and appearance. Imports validate the complete structure, identifiers, field sizes, rich text, links and embedded raster images. Compatible optional fields receive defaults.

Native imports accept up to 64 MiB. Imported documents receive independent identities. Import review does not replace the current document. Creation/update fields support history, identity preservation and conflict detection; they are part of the file format.

## Recovery and workspace backup

Recovery files isolate damaged records from healthy documents. Each part supports up to 64 MiB and 1,000 records. Recoverable documents become independent copies; unresolved raw data remains downloadable. Oversized raw records are preserved separately for manual inspection.

Workspace backup includes documents, history, appearance presets and logo assets. Review precedes import, and imported identities are remapped. A failed transaction does not partially replace stored data.

Directory backup and linked JSON files require browser File System Access support and explicit permission. External changes are checked before writing. A changed file can be inspected and restored as an independent document. Linked-file associations end when the page closes or refreshes; other browsers can continue using downloads and imports.

## Interchange

Markdown and text imports create reviewed documents. Markdown exports visible content by default; including the original preserves hidden content, images and layout for a full round trip. When readable text and the embedded original differ, import review offers them separately.

Standalone HTML embeds fonts and local images for offline viewing and printing. Word preserves supported rich text, images and tables. Foreign-format imports validate supported fields and require review; unsupported data is reported rather than silently treated as a native document.

## Final outputs

Native A4 printing and direct paginated PDF preserve selectable text where supported. Direct PDF requires the API runtime. Continuous PDF contains rendered images on one long page. Large PNG output is split into numbered parts; download every part to retain all content.

PDF and PNG are final outputs, not editable backups. Local PDF text extraction and OCR provide reviewed text import rather than reconstruction of the original editor state. OCR runs through same-origin local workers with English and Simplified Chinese language data.
