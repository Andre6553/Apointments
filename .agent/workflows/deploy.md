---
description: Automatically push all changes to GitHub and Vercel
---

// turbo-all

Follow these steps to deploy the application:

1. **Stage all changes**:
   `git add .`

2. **Commit with a descriptive message**:
   `git commit -m "Deployment update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"`

3. **Push to GitHub**:
   `git push origin main`

4. **Deploy to Vercel Production**:
   `npx vercel --prod --yes`
