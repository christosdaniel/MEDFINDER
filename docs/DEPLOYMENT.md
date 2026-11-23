# Deploying MedFinder

## Quick hosted demo: Render (API) + GitHub Pages (web apps)

The pharmacy portal and admin console are static web apps, so GitHub Pages can host them. The API is a server, so it runs on Render (free tier).

**1. Host the API on Render**
1. Sign in at https://render.com with GitHub.
2. **New → Blueprint**, pick the `MEDFINDER` repository. Render reads `render.yaml`.
3. Enter an `ADMIN_PASSWORD` when asked, then **Apply**.
4. When it's live, open `https://<your-service>.onrender.com/api/health`. You should see `{"ok":true,...}`. Copy the service URL.

Free-plan notes: the service sleeps after 15 minutes without traffic (the first request then takes up to a minute), and the database resets on restart because there's no disk. Demo data is reloaded automatically (`SEED_DEMO=true`). For real users, add a disk and set `DB_PATH` (see `render.yaml`), connect SMS, and set `SEED_DEMO` and `EXPOSE_DEV_OTP` to `false`.

**2. Publish the web apps on GitHub Pages**
1. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables → New repository variable**: name `MEDFINDER_API_URL`, value `https://<your-service>.onrender.com/api`.
3. **Actions → Deploy web apps to GitHub Pages → Run workflow** (it also runs on every push to `main`).

Then open:
- `https://christosdaniel.github.io/MEDFINDER/`: landing page
- `https://christosdaniel.github.io/MEDFINDER/pharmacy/`: pharmacy portal
- `https://christosdaniel.github.io/MEDFINDER/admin/`: admin console

If the API URL changes, update the variable and re-run the workflow. If your Pages address is different, update `CORS_ORIGINS` in Render.

**3. Point the mobile app at the hosted API (optional)**: set `EXPO_PUBLIC_API_URL=https://<your-service>.onrender.com/api` in `mobile/.env`.

---

## 1. API (`backend/`)

Any host that runs Node.js 22.13+ with a persistent disk works (a VPS, Render, Railway, Fly.io...).

```bash
npm install --omit=dev
```

```bash
NODE_ENV=production JWT_SECRET=<long random string> ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=<strong> \
CORS_ORIGINS=https://pharmacy.example.com,https://admin.example.com DB_PATH=/data/medfinder.db \
npm start -w backend
```

- Put it behind HTTPS (Caddy / Nginx / the platform's TLS).
- Back up the database file (`DB_PATH`) daily.
- In production the OTP code is **not** returned in responses. Implement your SMS provider in `backend/src/lib/sms.js` (e.g. Hubtel, Arkesel, mNotify, Twilio) and set `SMS_PROVIDER`.
- Subscription payments are recorded by `POST /api/pharmacy/subscription/pay`. For real payments, call your provider (e.g. Paystack, Hubtel MoMo) and record the payment from its verified webhook.

## 2. Web apps

```bash
VITE_API_URL=https://api.example.com/api npm run build
```

Upload `pharmacy-web/dist` and `admin-web/dist` to any static host (Netlify, Vercel, S3, Nginx). Configure SPA fallback to `index.html`. Keep the admin console on a separate domain and consider IP-restricting it.

## 3. Mobile app

Set `EXPO_PUBLIC_API_URL=https://api.example.com/api` (in `mobile/.env` or EAS environment variables), then:

```bash
npm install -g eas-cli
```

```bash
cd mobile && eas build --platform all
```

For Google Maps on Android release builds, add an API key under `android.config.googleMaps.apiKey` in `app.json`. Submit with `eas submit`.

## 4. Stock Sync agent

Give pharmacies the `tools/stock-sync-agent` folder (or package it with `pkg`/`nexe` into a single .exe). They run it with their sync key and file path; see its README.
