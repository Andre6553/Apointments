---
description: Standard procedure for diagnosing system issues by analyzing the latest logs and server status.
---

1. Find and read the latest log file to catch recent errors.
// turbo
Get-ChildItem -Path "Logs" -Filter "*.log" | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { Write-Output "Check Log: $($_.Name)"; Get-Content $_.FullName -Tail 200 }

2. Check the status of the Twilio Proxy server (Port 3001) to ensure background jobs (like Cron) are running.
// turbo
$proc = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess; if ($proc) { Write-Output "Twilio Proxy is RUNNING (PID $proc)" } else { Write-Warning "Twilio Proxy is STOPPED" }

3. Search for specific keywords in the log if provided (e.g., "Error", "Stuck", "WhatsApp").
// turbo
Get-ChildItem -Path "Logs" -Filter "*.log" | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Select-String -Pattern "Error|Exception|Stuck|Fail" -Context 0,2
