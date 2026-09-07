# Cloudflare Frontend and Local Backend

## Architecture

| Route                                 | Runtime                     |
| ------------------------------------- | --------------------------- |
| `https://resume.lunelu.com/`          | Cloudflare static assets    |
| `https://resume.lunelu.com/api/*`     | Cloudflare Worker proxy     |
| `https://resume-api.lunelu.com/api/*` | Dedicated Cloudflare Tunnel |
| `http://127.0.0.1:5176/api/*`         | Local Node API service      |

The browser uses same-origin API URLs. The Worker forwards requests to the fixed
Tunnel origin and adds a private proxy token. The local service checks the token
and exact application origin. Public mode disables loopback model-provider
endpoints, ignores forwarded-origin headers, and binds only to `127.0.0.1`.
API responses are not cached. Streaming and cancellation pass through the proxy.
Entry HTML and OAuth callback pages use `Cache-Control: no-transform` to prevent
automatic CDN script injection without relaxing the same-origin content policy.

Editing, browser storage, local OCR, native printing, and browser-rendered exports
remain independent of the computer running the backend. AI, remote resources,
and direct paginated PDF require the computer, Node process, and Tunnel connector
to remain online. Backend unavailability returns JSON 503 while the static
application remains available.

## Requirements

- Node.js 22.13 or newer and pnpm 10.26.0.
- Cloudflare account access for the `lunelu.com` zone and Workers deployment.
- `cloudflared` installed on the backend computer.
- Edge, Chrome, or Playwright Chromium for direct PDF and SVG rendering.

The commands below run from the Luck project directory. Use `pnpm` instead of
`pnpm.cmd` outside Windows.

## Configure the local service

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd setup:backend
```

Setup creates `.env.local` and `.cloudflared/worker-secrets.json`. The two files
contain the same randomly generated proxy token. Existing valid configuration
is reused. The token is not displayed. Both paths are ignored by Git and excluded
from runtime packages.

`.env.local` contains `LUCK_PUBLIC_ORIGIN`, `LUCK_PROXY_TOKEN`, and `PORT`. The
defaults are `https://resume.lunelu.com` and port `5176`. Changing the public
origin also requires updating the Worker variables and custom-domain route.
The proxy token is an infrastructure credential, separate from user-provided
model API keys. Provider keys remain supplied through the application.

Start the local API:

```powershell
pnpm.cmd start:api
```

This API-only service does not need `dist/`. Direct access without the proxy token
returns 403, including `/api/health`. The local preview remains available through
`pnpm.cmd preview:secure` on port `5175`; it is a separate development runtime.

## Create a dedicated Tunnel

In the Cloudflare dashboard, create a Tunnel named `luck-resume`. Add a published
application route with:

| Setting      | Value                   |
| ------------ | ----------------------- |
| Hostname     | `resume-api.lunelu.com` |
| Service type | HTTP                    |
| Service URL  | `127.0.0.1:5176`        |

Save only the connector token in `.cloudflared/luck-token.txt` on the backend
computer. Use a dedicated Tunnel and token for this application. Keep the
existing domain Host header; no custom Origin or forwarding headers are needed.
The connector initiates outbound connections, so no router port forwarding is
required. See the [Cloudflare Tunnel setup guide](https://developers.cloudflare.com/tunnel/get-started/).

In a second terminal, start the connector:

```powershell
pnpm.cmd start:tunnel
```

Keep both terminals running. Closing either process, suspending the computer, or
losing its network connection makes backend operations unavailable. Restart the
API and connector after rebooting. These commands do not install a system-wide
service or modify another application's connector.

## Publish the frontend

Build and validate from the source checkout:

```powershell
pnpm.cmd test
pnpm.cmd build
pnpm.cmd release:check
```

A runtime package already contains `dist/` and the edge Worker, so it can reuse
that build. The Worker entry point and asset routes are declared in
[`wrangler.jsonc`](../wrangler.jsonc). Only `/api` and `/api/*` run through the
Worker before static asset routing; other assets are served independently.

Authenticate, upload the private proxy token, and deploy:

```powershell
npx.cmd wrangler login
npx.cmd wrangler secret bulk .cloudflared/worker-secrets.json
npx.cmd wrangler deploy
```

The configuration binds the custom domain `resume.lunelu.com` and forwards API
requests to `resume-api.lunelu.com`. The `workers.dev` hostname and preview URLs
are disabled. Cloudflare manages the custom-domain DNS record and TLS
certificate. An existing conflicting DNS record must be resolved before binding
the hostname; deployment does not require changing the parent website.

Upload the same proxy token to the Worker whenever it is rotated locally. Run
`pnpm.cmd setup:backend` after editing `.env.local` to regenerate the matching
Worker secret file, upload it again, and restart the API service.

## Verify the connection

```powershell
Invoke-RestMethod 'https://resume.lunelu.com/api/health'
```

The response reports `version`, `ai`, `assets`, and `pdf`. These indicate installed
handlers, not a successful model-provider or Chromium rendering check. Verify
provider connectivity with the application's synthetic connection test, then
verify direct PDF output. No real resume content is needed for the connection
test.

The raw Tunnel hostname should reject unauthenticated API requests with 403.
Stopping the API should make the public health endpoint return JSON 503 while
the homepage still loads. Local-only tests verify proxy authorization, origin
checks, streaming, cancellation, configuration reuse, and backend forwarding;
they do not establish that the Cloudflare account or DNS has been configured.
