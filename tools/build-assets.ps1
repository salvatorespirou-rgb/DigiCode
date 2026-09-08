param([string]$Esbuild = "$PSScriptRoot/../node_modules/esbuild-win/package/esbuild.exe")
$ErrorActionPreference = 'Stop'
Push-Location "$PSScriptRoot/.."
try {
  if (-not (Test-Path -LiteralPath $Esbuild)) { throw 'Install esbuild 0.25.12 or pass -Esbuild with its executable path.' }
  # Both source stylesheets resolve fonts and images relative to css/.
  $styles = (Get-Content css/fonts.css -Raw) + "`n" + (Get-Content css/style.css -Raw)
  $compiled = $styles | & $Esbuild --loader=css --minify --target=chrome90,firefox90,safari14
  if ($LASTEXITCODE) { throw 'CSS build failed' }
  [IO.File]::WriteAllText((Join-Path (Get-Location) 'css/site.min.css'), ($compiled -join "`n"), [Text.UTF8Encoding]::new($false))
  foreach ($name in @('main','digital-cards','live-chat','analytics')) {
    # Preserve identifiers and statements used by existing inline handlers.
    & $Esbuild "js/$name.js" --minify-whitespace "--outfile=js/$name.min.js"
    if ($LASTEXITCODE) { throw "JavaScript build failed: $name" }
  }
} finally { Pop-Location }
