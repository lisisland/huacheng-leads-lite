$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'start-desktop.ps1') -NoBrowser
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Start-Process 'http://127.0.0.1:15188/focus.html'
