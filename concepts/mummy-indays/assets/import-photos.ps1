# =============================================================================
# import-photos.ps1
# Mummy Inday's Catering — pitch build, photography import
#
# RUN THIS ONLY WITH MUMMY INDAY'S WRITTEN PERMISSION.
#
# The photographs on mummyindays.com belong to the business. This build ships
# without them on purpose: every image slot falls back to a drawn stand-in, so
# the pitch is presentable with nothing copied. Once they engage DigiCode (or
# tell you in writing you may use their photos for the proposal), run this and
# the real photography drops into every slot with no change to the markup.
#
#   powershell -ExecutionPolicy Bypass -File assets\import-photos.ps1
#
# To use their newer/better shots instead, just save any JPG into assets\img\
# under the target name in the left column below.
# =============================================================================

$ErrorActionPreference = 'Stop'
$dest = Join-Path $PSScriptRoot 'img'
New-Item -ItemType Directory -Force -Path $dest | Out-Null

# target filename  ->  source on the live site
$map = [ordered]@{
  'family.jpg'     = 'https://mummyindays.com/wp-content/uploads/2021/03/img_2085.jpg'
  'lechon-1.jpg'   = 'https://mummyindays.com/wp-content/uploads/2024/04/img_2452.jpg'
  'pancit.jpg'     = 'https://mummyindays.com/wp-content/uploads/2021/03/pancit-edited.jpg'
  'buffet.jpg'     = 'https://mummyindays.com/wp-content/uploads/2024/04/img_2456.jpg'
  'skewers.jpg'    = 'https://mummyindays.com/wp-content/uploads/2024/04/bbq-tocino-skewers-edited.jpg'
  'kare-kare.jpg'  = 'https://mummyindays.com/wp-content/uploads/2021/03/adobo.jpg'
  'leche-flan.jpg' = 'https://mummyindays.com/wp-content/uploads/2024/04/macaroni-fruit-salad-sq-edited.jpg'
  'kinilaw.jpg'    = 'https://mummyindays.com/wp-content/uploads/2024/04/kinilaw-2-edited.jpg'
  'spread.jpg'     = 'https://mummyindays.com/wp-content/uploads/2024/04/img_2458.jpg'
}

Write-Host ''
Write-Host '  Mummy Inday''s — photography import' -ForegroundColor Yellow
Write-Host '  Only proceed if you have the business''s permission.' -ForegroundColor DarkYellow
Write-Host ''

$ok = Read-Host '  Do you have written permission? (yes/no)'
if ($ok -ne 'yes') {
  Write-Host '  Stopped. The build stays on its drawn stand-ins.' -ForegroundColor DarkGray
  exit 0
}

foreach ($name in $map.Keys) {
  $target = Join-Path $dest $name
  try {
    Invoke-WebRequest -Uri $map[$name] -OutFile $target -UseBasicParsing
    $kb = [math]::Round((Get-Item $target).Length / 1KB)
    Write-Host "  saved  $name  ($kb KB)" -ForegroundColor Green
  } catch {
    Write-Host "  failed $name  — $($_.Exception.Message)" -ForegroundColor Red
  }
}

Write-Host ''
Write-Host '  Done. Reload the page; cinema.js picks the files up automatically.' -ForegroundColor Cyan
