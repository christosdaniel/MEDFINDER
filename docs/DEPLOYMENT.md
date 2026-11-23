# Deploying MedFinder

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
