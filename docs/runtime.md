# Luck Resume Runtime

The original software is licensed under PolyForm Noncommercial 1.0.0 by zayne.
See the package's `LICENSE` and `docs/licensing.md` for terms and the additional
permission for creating and sharing personal resumes. Third-party notices are
included in `dist/THIRD_PARTY_NOTICES.txt` and alongside the assets.

## Start a built package

Requirements: Node.js 22.13 or newer, pnpm 10, and Edge/Chrome or Playwright Chromium for direct PDF and remote SVG conversion.

```powershell
pnpm.cmd install --prod --frozen-lockfile
pnpm.cmd start
```

Open `http://127.0.0.1:5175`. `PORT` selects another loopback port. For a source checkout, install development dependencies and run `pnpm.cmd build` before starting the service.

If no supported browser is installed:

```powershell
pnpm.cmd exec playwright install chromium
```

## Split hosting

For a Cloudflare frontend connected to this computer, run `pnpm.cmd setup:backend`
and `pnpm.cmd start:api`. This starts an API-only service on port `5176` using
`.env.local`. In a second terminal, run `pnpm.cmd start:tunnel` after saving the
dedicated connector token in `.cloudflared/luck-token.txt`. The full configuration
and frontend publication steps are in `docs/tunnel.md` in the source checkout or
runtime package.

The public API requires the private Worker proxy token and the configured HTTPS
application origin. Local model-provider endpoints are disabled in this mode.
Keep the API process, connector, computer, and network online for backend features.
The default `pnpm.cmd start` remains the local combined preview on port `5175`.

## API behavior

- `/api/ai/*`: provider/model discovery, synthetic connection tests, generation and optional OAuth exchange. Selected content is sent only after an explicit operation. Browser credentials remain session-only unless device persistence is selected.
- `/api/assets/*`: requested images, organization resources and GitHub activity. Imported raster pixels or contribution snapshots remain portable without credentials.
- `/api/pdf`: memory-only Chromium rendering of embedded A4 HTML. Page JavaScript and external requests are disabled; jobs are bounded and browser resources close after completion or cancellation.

Requests use same-origin bounded JSON. Remote fetches validate protocols, addresses and redirects. Local compatible-provider mode permits explicitly configured loopback endpoints. The service itself binds loopback and validates loopback API hosts; public service routing requires separate deployment configuration.

## AI setup

Choose a provider, supply its credentials or a compatible endpoint, fetch the model catalog and assign models. Connection and vision tests use synthetic content. Polish, grammar and semantic import keep results in review until accepted. Cancelled, incomplete or failed results cannot be applied as completed output.

Orca uses discovery and PKCE with session state. Its callback route is `/auth/orca/callback`; a registered application ID may be configured when required by the provider.

## Storage

The server does not store resumes or credentials in files. Drafts, history and libraries remain in browser storage. Back up editable content as JSON or a workspace archive before clearing site data or moving origins. Optional AI and live-resource operations depend on the configured provider and report failures with retry/cancellation.
