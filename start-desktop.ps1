param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$url = 'http://127.0.0.1:15188/'
$runtime = Join-Path $root '.local-runtime'
$mutex = New-Object System.Threading.Mutex($false, 'Local\GoodJobDesktopLauncher')
$locked = $false
function Test-GoodJobReady {
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:14188/api/health' -TimeoutSec 2
        if (-not $health.ok) { return $false }
        $web = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        if ($web.StatusCode -ne 200) { return $false }
        foreach ($port in @(3310, 13100, 15193)) {
            if (-not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) { return $false }
        }
        return $true
    } catch { return $false }
}
try {
    # Serialize desktop clicks so the same local services are reused.
    try { $locked = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { exit 0 }
    if (-not (Test-GoodJobReady)) {
        $activePorts = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(14188,15188,13100,15193) })
        if ($activePorts.Count -gt 0) {
            throw 'Some GoodJob services are already running but are not ready. Please check the local services before restarting.'
        }
        New-Item -ItemType Directory -Path $runtime -Force | Out-Null
        $startup = Join-Path $root 'start-local.ps1'
        $hostExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $service = Start-Process -FilePath $hostExe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $startup + '"')) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime 'startup.log') -RedirectStandardError (Join-Path $runtime 'startup-error.log') -PassThru
        $service.Id | Set-Content -LiteralPath (Join-Path $runtime 'launcher.pid')
        $deadline = [DateTime]::UtcNow.AddSeconds(90)
        while (-not (Test-GoodJobReady)) {
            $service.Refresh()
            if ($service.HasExited) { throw 'GoodJob stopped during startup. See .local-runtime\startup-error.log.' }
            if ([DateTime]::UtcNow -gt $deadline) { throw 'GoodJob startup timed out. See .local-runtime\startup.log and startup-error.log.' }
            Start-Sleep -Milliseconds 700
        }
    }
    Write-Output 'GoodJob is ready: http://127.0.0.1:15188/'
    if (-not $NoBrowser) { Start-Process $url }
} catch {
    Write-Output ('GoodJob startup failed: ' + $_.Exception.Message)
    if (-not $NoBrowser) {
        $shell = New-Object -ComObject WScript.Shell
        $shell.Popup($_.Exception.Message, 30, 'GoodJob startup', 16) | Out-Null
    }
    exit 1
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
