---
description: Deep analysis of daily logs with insightful reporting on system health and crises.
---
// turbo-all

1. Run the daily log analysis engine to aggregate operational metrics.
`node scripts/analyze_daily_logs.js`

2. Display the generated insight report.
`cat DailyLogsWalkthrough.md`

3. [Optional] Cleanup the temporary report if desired.
`Write-Output "Report available at: $(Get-Location)\DailyLogsWalkthrough.md"`
