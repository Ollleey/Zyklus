# ZYKLUS für Windows installieren bzw. aktualisieren:
#   irm https://raw.githubusercontent.com/Ollleey/Zyklus/main/scripts/install.ps1 | iex
# Lädt den Installer des neuesten Releases und installiert ihn für den aktuellen Benutzer
# (ohne Adminrechte). Spielstände bleiben erhalten.
$ErrorActionPreference = 'Stop'
$repo = 'Ollleey/Zyklus'

$release = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'zyklus-install' }
$asset = $release.assets | Where-Object { $_.name -like '*_x64-setup.exe' } | Select-Object -First 1
if (-not $asset) { throw "Im neuesten Release ($($release.tag_name)) fehlt der Windows-Installer." }

$file = Join-Path $env:TEMP $asset.name
Write-Host "ZYKLUS $($release.tag_name): lade $($asset.name) ..."
Invoke-WebRequest $asset.browser_download_url -OutFile $file -UseBasicParsing
Write-Host 'Installiere ...'
$p = Start-Process $file -ArgumentList '/S' -Wait -PassThru
Remove-Item $file -ErrorAction SilentlyContinue
if ($p.ExitCode -ne 0) { throw "Der Installer hat mit Code $($p.ExitCode) abgebrochen." }
Write-Host 'Fertig: ZYKLUS steht im Startmenü.'
