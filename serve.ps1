$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = if ($env:PORT) { $env:PORT } else { 5500 }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Serving $root on http://localhost:$port/"

$mime = @{
  ".html" = "text/html"
  ".css"  = "text/css"
  ".js"   = "application/javascript"
  ".json" = "application/json"
  ".xml"  = "application/xml"
  ".txt"  = "text/plain"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".webp" = "image/webp"
  ".gif"  = "image/gif"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
  ".mp4"  = "video/mp4"
  ".woff" = "font/woff"
  ".woff2" = "font/woff2"
}

# Mirror how GitHub Pages resolves a request, so a link that works locally
# works in production and vice versa. Pages serves /scripts from scripts.html
# and /folder/ from folder/index.html; without this the site's clean URLs all
# 404 locally while being perfectly fine once deployed.
function Resolve-RequestPath {
  param([string]$Root, [string]$UrlPath)

  $rel = $UrlPath.TrimStart("/")
  if ($rel -eq "") { $rel = "index.html" }

  $candidates = @(
    (Join-Path $Root $rel),
    (Join-Path $Root ($rel + ".html")),
    (Join-Path $Root (Join-Path $rel "index.html"))
  )
  foreach ($c in $candidates) {
    if (Test-Path $c -PathType Leaf) { return $c }
  }
  return $null
}

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $request = $context.Request
  $response = $context.Response

  $filePath = Resolve-RequestPath -Root $root -UrlPath ([Uri]::UnescapeDataString($request.Url.LocalPath))

  if ($filePath) {
    $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
    $contentType = $mime[$ext]
    if (-not $contentType) { $contentType = "application/octet-stream" }
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    $response.ContentType = $contentType
    $response.Close($bytes, $false)
  } else {
    $response.StatusCode = 404
    $response.OutputStream.Close()
  }
}
