---
description: Force restart both the backend Twilio proxy and the frontend Vite server by killing existing processes on ports 3001 and 5173.
---
// turbo-all

1. Kill any processes currently occupying ports 3001 (Backend) and 5173 (Frontend).
`Get-NetTCPConnection -LocalPort 3001,5173 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force }`

2. Start the Backend Server (Twilio Proxy).
`node server/twilio-proxy.js`

3. Start the Frontend Server (Vite).
`npm run dev`
