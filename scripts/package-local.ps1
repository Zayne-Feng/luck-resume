$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$packageRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot '.cache/runtime-package'))
if (-not $packageRoot.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The package directory must stay inside the project.'
}
if (Test-Path -LiteralPath $packageRoot) { Remove-Item -LiteralPath $packageRoot -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $packageRoot 'scripts') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'dist') -Destination $packageRoot -Recurse
New-Item -ItemType Directory -Path (Join-Path $packageRoot 'server') -Force | Out-Null
foreach ($file in (Get-ChildItem -LiteralPath (Join-Path $projectRoot 'server') -File | Where-Object { $_.Extension -in '.mjs', '.mts' })) {
  Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $packageRoot 'server')
}
foreach ($file in @('package.json', 'pnpm-lock.yaml', 'LICENSE', '.env.example', 'wrangler.jsonc')) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $packageRoot
}
foreach ($file in @('serve-build.mjs', 'serve-api.mjs', 'setup-backend.mjs')) {
  Copy-Item -LiteralPath (Join-Path $projectRoot ('scripts/' + $file)) -Destination (Join-Path $packageRoot 'scripts')
}
New-Item -ItemType Directory -Path (Join-Path $packageRoot 'cloudflare') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'cloudflare/worker.mjs') -Destination (Join-Path $packageRoot 'cloudflare')
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs/runtime.md') -Destination (Join-Path $packageRoot 'README.md')
New-Item -ItemType Directory -Path (Join-Path $packageRoot 'docs') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs/licensing.md') -Destination (Join-Path $packageRoot 'docs/licensing.md')
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs/tunnel.md') -Destination (Join-Path $packageRoot 'docs/tunnel.md')
$manifest = @(Get-ChildItem -LiteralPath $packageRoot -File -Recurse | Sort-Object FullName | ForEach-Object {
  [ordered]@{ path = $_.FullName.Substring($packageRoot.Length + 1).Replace('\', '/'); bytes = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
})
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $projectRoot '.cache/runtime-manifest.json') -Encoding UTF8
Compress-Archive -Path (Join-Path $packageRoot '*') -DestinationPath (Join-Path $projectRoot '.cache/luck-resume-local.zip') -Force
Write-Output "Prepared local runtime archive with $($manifest.Count) files."
