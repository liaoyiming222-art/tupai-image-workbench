param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
$appUrl = 'http://127.0.0.1:5137'
try {
    $existing = Invoke-RestMethod -Uri "$appUrl/api/state" -TimeoutSec 2
    if ($existing.appName -eq 'local-image-workbench') { if (-not $NoBrowser) { Start-Process $appUrl }; exit 0 }
} catch {}
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) { throw '需要 Node.js 22 或更新版本。请安装后再次启动。' }
$runtimeDir = Join-Path $appRoot '.local'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$serverPath = Join-Path $appRoot 'server.mjs'
$serverProcess = Start-Process -FilePath $nodePath -ArgumentList ('"' + $serverPath + '"') -WorkingDirectory $appRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'service.log') -RedirectStandardError (Join-Path $runtimeDir 'service-error.log') -PassThru
$serverProcess.Id | Set-Content -LiteralPath (Join-Path $runtimeDir 'service.pid')
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 250
    try {
        $health = Invoke-RestMethod -Uri "$appUrl/api/state" -TimeoutSec 1
        if ($health.appName -eq 'local-image-workbench') { if (-not $NoBrowser) { Start-Process $appUrl }; exit 0 }
    } catch {}
}
throw '启动未完成，请查看 .local/service-error.log。'
