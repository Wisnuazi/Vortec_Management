Start-Sleep -Seconds 6

Write-Host "=== /organization ==="
$r = Invoke-WebRequest -Uri "http://localhost:3000/organization" -UseBasicParsing
Write-Host "status: $($r.StatusCode)"

Write-Host ""
Write-Host "=== /organization/structure ==="
$r = Invoke-WebRequest -Uri "http://localhost:3000/organization/structure" -UseBasicParsing
Write-Host "status: $($r.StatusCode)"

Write-Host ""
Write-Host "=== /organization/roles ==="
$r = Invoke-WebRequest -Uri "http://localhost:3000/organization/roles" -UseBasicParsing
Write-Host "status: $($r.StatusCode)"

Write-Host ""
Write-Host "=== /organization/workflow (untouched) ==="
$r = Invoke-WebRequest -Uri "http://localhost:3000/organization/workflow" -UseBasicParsing
Write-Host "status: $($r.StatusCode)"

Write-Host ""
Write-Host "=== /organization/sop (untouched) ==="
$r = Invoke-WebRequest -Uri "http://localhost:3000/organization/sop" -UseBasicParsing
Write-Host "status: $($r.StatusCode)"