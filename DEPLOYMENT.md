# Deployment Guide (PWA & Stores)

Your application is now **Code Ready** for deployment.
However, because your mobile app cannot connect to your "localhost" server, you must perform these infrastructure steps before submitting to Google Play.

## 1. Deploy the Backend (Supabase Edge Function)
The local `server/twilio-proxy.js` must be replaced by the cloud function I created in `supabase/functions/send-whatsapp`.

**Steps:**
1.  Install Supabase CLI (if not installed): `npm install -g supabase`
2.  Login: `supabase login`
3.  Link your project: `supabase link --project-ref <your-project-id>` (Find this in your Supabase Dashboard URL: `app.supabase.com/project/YOUR_ID`)
4.  Deploy: 
    ```bash
    supabase functions deploy send-whatsapp --no-verify-jwt
    ```
5.  Set Secrets (Your Twilio keys):
    ```bash
    supabase secrets set TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... TWILIO_WHATSAPP_FROM=whatsapp:+1415...
    ```

## 2. Deploy the Frontend (Vercel/Netlify)
1.  Push your code to GitHub.
2.  Connect your repo to Vercel or Netlify.
3.  Add your Environment Variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, etc.) in the Vercel/Netlify dashboard.
4.  **Important**: Ensure `VITE_TWILIO_WHATSAPP_FROM` matches your production number (+1555...) if going live!

## 3. Google Play (Trusted Web Activity)
Once your URL is live (e.g., `https://my-appt-app.vercel.app`), you can use **PWABuilder**:
1.  Go to [PWABuilder.com](https://www.pwabuilder.com).
2.  Enter your live URL.
3.  It will score your Manifest and Service Worker (which I just installed!).
4.  Click **Package for Store** -> **Android**.
5.  Download the `.aab` bundle and upload to Google Play Console.

## Checklist
- [x] PWA Plugin Installed (`vite-plugin-pwa`)
- [x] Offline Service Worker Generated
- [x] Manifest Configured
- [x] Backend Deployed (You must do this)
- [ ] **Frontend Deployed** (You must do this)
