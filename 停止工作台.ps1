$ErrorActionPreference = 'Stop'
$appUrl = 'http://127.0.0.1:5137'
$state = Invoke-RestMethod -Uri "$appUrl/api/state" -TimeoutSec 3
if ($state.appName -ne 'local-image-workbench') { throw '此端口不是图派工作台。' }
$headers = @{ 'X-Local-Token' = $state.token }
Invoke-RestMethod -Uri "$appUrl/api/shutdown" -Method Post -ContentType 'application/json' -Headers $headers -Body '{}' -TimeoutSec 5 | Out-Null
Write-Output '本地工作台已停止。'
