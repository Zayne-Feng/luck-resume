<p align="center">
  <img src="public/favicon.svg" width="64" height="64" alt="Luck Resume logo" />
</p>

<h1 align="center">Luck Resume</h1>

<p align="center">
  A local-first resume editor with flexible layouts, portable backups,<br />
  and a Chinese and English interface.
</p>

<p align="center">
  <a href="https://resume.lunelu.com/"><strong>Open app ↗</strong></a> ·
  <a href="#features">Features</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#development">Development</a> ·
  <a href="#documentation">Documentation</a> ·
  <a href="#license">License</a>
</p>

## Features

Luck Resume combines nine resume layouts with a shared document model and live
preview. Macaron accents, four bundled Chinese fonts, and editable appearance
presets support consistent styling across the editor and exported documents.

| Area        | Capabilities                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| Content     | Profile fields, experience, education, projects, publications, custom sections, and custom fields                   |
| Editing     | Rich text, lists, headings, links, code, tables, merged cells, and selection formatting                             |
| Layout      | Section and entry ordering, visibility, column placement, manual page breaks, and one-page fitting                  |
| Appearance  | Colors, typography, reusable presets, photos, logos, and local image libraries                                      |
| Persistence | Local drafts, undo/redo, version history, conflict recovery, linked JSON files, and directory or workspace backups  |
| Import      | Reviewed JSON, Markdown, HTML, and text import; local PDF text extraction and English/Chinese OCR                   |
| Export      | Editable JSON, Markdown, standalone HTML, Word, A4 PDF, long PDF, and segmented PNG                                 |
| Assistance  | Optional AI polishing, grammar review, semantic import, organization images, and GitHub activity snapshots          |
| Interface   | Chinese/English localization, responsive panels, settings search, keyboard navigation, and light/dark/system themes |

## Quick start

### Requirements

| Dependency | Requirement                             |
| ---------- | --------------------------------------- |
| Node.js    | 22.13 or newer                          |
| pnpm       | 10.26.0, as specified in `package.json` |
| Browser    | IndexedDB and native printing support   |

Run from the project directory:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open **[http://127.0.0.1:5174](http://127.0.0.1:5174)**.

On Windows PowerShell, use `pnpm.cmd` if script execution is restricted.
The included `start-local.cmd` also starts the development server.

Create a document, choose a layout, and edit its content and appearance. Check
the page preview before exporting. Save JSON to retain an editable copy;
PDF and PNG are delivery formats rather than editable backups.

## Data and privacy

Drafts, history, presets, and image libraries are stored in the current browser.
Editing, layout, local PDF extraction, OCR, and native printing run on the
device. The application does not provide cloud resume storage.

Optional AI operations send selected content to the configured provider through
the API. Direct paginated PDF export sends document HTML to the Node service for
temporary rendering. Credentials are session-only by default; persistence on
the device is an explicit setting.

Browser storage is specific to the browser profile and website origin. Download
a JSON or workspace backup before clearing site data or moving to another browser
or domain. Direct file and directory linking requires File System Access support
and permission; JSON download and import remain available in other browsers.

## Development

### Technology

| Layer                    | Libraries                             |
| ------------------------ | ------------------------------------- |
| Interface                | React, TypeScript, Vite, Lucide       |
| Editing and state        | TipTap, Zustand                       |
| Document output          | docx, jsPDF, html-to-image            |
| PDF and OCR              | PDF.js, Tesseract.js                  |
| Service and verification | Node.js, Playwright, Node test runner |

### Project structure

```text
src/
  ai/             Provider configuration and reviewed AI operations
  components/     Editor, preview, and supporting interfaces
  i18n/           Interface translations
  resume/         Document model, validation, layout, and formats
  storage/        Browser storage, history, and file backups
  stores/         Workspace state
  styles/         Interface and resume styles
server/           AI, remote-resource, and PDF APIs
cloudflare/       Edge API proxy and static asset integration
public/           Fonts, PDF/OCR assets, licenses, and hosting headers
scripts/          Asset preparation, packaging, and test runners
tests/            Unit, integration, and browser checks
docs/             Runtime, deployment, data formats, and licensing
```

### Verification

```sh
pnpm test
```

| Command                     | Coverage                                                               |
| --------------------------- | ---------------------------------------------------------------------- |
| `pnpm test:parity`          | Editor, media, AI, and page fitting workflows                          |
| `pnpm test:editor-freedom`  | Content controls, rich text, icons, and pagination                     |
| `pnpm test:functional`      | Tables, entry transfer, format compatibility, and Word export          |
| `pnpm test:repairs`         | Grammar, interchange, linked history, portability, and review behavior |
| `pnpm test:improvements`    | Settings, appearance, layout checks, history, backups, and persistence |
| `pnpm test:document-import` | PDF extraction and OCR workflows                                       |
| `pnpm test:exports`         | Font-aware exports and directory backup workflows                      |

These workflow suites start a local development server when needed. Browser
checks use isolated fixtures and write generated output to `test-results/`.
External-provider checks use controlled responses without real credentials.

For production browser checks, start the secure preview described below, then
run the following in another PowerShell session:

```powershell
$env:LUCK_TEST_URL = 'http://127.0.0.1:5175'
$env:LUCK_FLEXIBLE_URL = 'http://127.0.0.1:5175'
$env:LUCK_MATRIX_URL = 'http://127.0.0.1:5175'
pnpm.cmd test:browser
pnpm.cmd test:matrix
```

Install browser engines with `pnpm exec playwright install chromium firefox webkit`.
On Windows, Chromium checks use the installed Microsoft Edge channel.

## Build and deployment

```sh
pnpm build
pnpm release:check
pnpm preview:secure
```

The build is written to `dist/`. The secure preview serves the build, security
headers, and APIs at **[http://127.0.0.1:5175](http://127.0.0.1:5175)**,
binding to loopback only.

| Hosting mode                    | Available capabilities                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| Static assets                   | Local editing, backups, OCR, native printing, and browser-rendered exports           |
| Static assets with the Node API | Also provides AI operations, remote resources, and direct selectable-text PDF export |

`wrangler.jsonc` serves static assets and routes `/api/*` through a Cloudflare
Worker to a dedicated Tunnel. The backend runs on the existing computer, listens
only on loopback, and requires a private proxy token. Direct PDF rendering and
remote SVG conversion require Edge, Chrome, or Playwright Chromium.

Initialize and start the backend:

```sh
pnpm setup:backend
pnpm start:api
```

After configuring the dedicated Tunnel, run `pnpm start:tunnel` in another
terminal. Keep the computer, API process, and connector online for backend
features. Static editing and local backups remain available when the backend
is offline. Follow the [Tunnel deployment guide](docs/tunnel.md) to configure
Cloudflare, upload the proxy secret, and publish the frontend.

The live application is **[resume.lunelu.com](https://resume.lunelu.com/)**,
under **[lunelu.com](https://lunelu.com/)**. Its footer links back to this README.
Self-hosted deployments must configure their own hosting, DNS, and HTTPS. Asset
paths assume the root of an origin; hosting under a repository subpath requires
configuration changes. See the [deployment guide](docs/deployment.md) for details.

To package a completed build on Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-local.ps1
```

The archive is written to `.cache/luck-resume-local.zip` and includes the build,
service modules, dependency manifests, runtime instructions, and license notices.

## Documentation

| Guide                                 | Contents                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------ |
| [Data formats](docs/data-format.md)   | Editable files, imports, exports, recovery, and backups                  |
| [Runtime](docs/runtime.md)            | Node service, browser requirements, API behavior, and AI setup           |
| [Deployment](docs/deployment.md)      | Build validation, static hosting, routing, and runtime packaging         |
| [Tunnel hosting](docs/tunnel.md)      | Cloudflare frontend, local API, private proxy token, and connector setup |
| [Licensing](docs/licensing.md)        | Noncommercial reuse, commercial licensing, and resume-user permissions   |
| [Fonts](public/fonts/README.md)       | Font sources, transformations, and redistribution licenses               |
| [OCR resources](public/ocr/README.md) | Local engines, language data, and source information                     |

## License

Copyright (c) 2026 zayne. Licensed under
[PolyForm Noncommercial 1.0.0](LICENSE).

Noncommercial use, modification, and redistribution are permitted under the
license terms. Commercial use requires a separate license from zayne. Individuals
may create, export, and share their own resumes for job applications and other
professional purposes under the [additional permission](docs/licensing.md#additional-permission-for-resume-users).

Third-party dependencies and bundled assets retain their respective licenses.
See [third-party notices](public/THIRD_PARTY_NOTICES.txt) and the license files
distributed alongside the font, PDF, and OCR resources.
