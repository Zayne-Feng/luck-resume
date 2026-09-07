# Build and Deployment

## Cloudflare frontend with a local API

The default Wrangler configuration serves the frontend at `resume.lunelu.com`
and proxies `/api/*` through a dedicated Tunnel to a local API on port `5176`.
See [Tunnel deployment](tunnel.md) for local setup, connector configuration,
Worker secrets, startup commands, and connection verification.

## Validate the build

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd test
pnpm.cmd build
pnpm.cmd release:check
pnpm.cmd preview:secure
```

The output is `dist/`. The secure preview runs on `http://127.0.0.1:5175`, applies `public/_headers` and returns 404 for missing assets rather than substituting application HTML. The release check creates `.cache/release-manifest.json` with asset paths, sizes and SHA-256 hashes. It rejects private configuration, logs, source maps, test artifacts and individual assets at or above 25 MiB.

## Static hosting

Use `pnpm install --frozen-lockfile` and `pnpm build`, with `dist` as the output directory. A repository containing the enclosing `Luck` directory must set the build root to `Luck`; a standalone repository can use its root.

`wrangler.jsonc` configures Cloudflare static assets, SPA handling, and a selective API proxy Worker. The application uses hash navigation. Preserve the included font, PDF and OCR assets, license files and security headers.

Static assets provide local editing, backups, local OCR, long image/PDF output and native printing. AI, remote-resource acquisition and direct selectable-text PDF use the Node API through the configured Tunnel. Uploading `dist/` alone does not publish the Worker or create the Tunnel; deploy the Wrangler configuration and configure its proxy token as described in the Tunnel guide.

The canonical URL, social metadata, robots and sitemap use `https://resume.lunelu.com/`. Verify them against the intended origin when configuring the deployment.

The live application is [resume.lunelu.com](https://resume.lunelu.com/), under [lunelu.com](https://lunelu.com/). Source code and the README are available in [Zayne-Feng/luck-resume](https://github.com/Zayne-Feng/luck-resume). The frontend is published with Wrangler; source pushes to GitHub do not trigger a deployment. Rebuild and validate changes before following the publication commands in the [Tunnel guide](tunnel.md). Asset URLs require hosting at the root of an origin; a GitHub Pages project path requires an asset-path configuration change.

## Local runtime package

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-local.ps1
```

The archive is `.cache/luck-resume-local.zip`. It includes the current build, Node service modules (`.mjs` and `.mts`), local preview/API/setup scripts, edge Worker, Wrangler configuration, environment example, dependency manifests, project license, and runtime/Tunnel instructions. The build contains third-party notices and asset licenses. Private configuration, connector credentials, proxy tokens, and logs are excluded. The package manifest is `.cache/runtime-manifest.json`. Install production dependencies and start it as described in the included README or [runtime instructions](runtime.md).

The package does not include development source, test output, browser profiles or private configuration. Packaging is local; the command does not publish files or modify DNS.
