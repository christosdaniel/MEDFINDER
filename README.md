<p align="center"><img src="assets/medfinder-logo.png" alt="MedFinder – Find medicine, save time and stay healthy." width="520"></p>

# MedFinder Ghana

MedFinder helps patients find medicine fast. Patients search for a medicine, see which nearby pharmacies have it in stock and at what price, then order it for pickup or delivery. Pharmacies keep their stock up to date from the Excel or Access files they already use. An admin team verifies pharmacies and controls both apps.

| System | Folder | Who uses it | Tech |
|---|---|---|---|
| **Patient mobile app** | [`mobile/`](mobile) | Patients / customers | Expo (React Native) + Expo Router, iOS & Android |
| **Pharmacy web app** | [`pharmacy-web/`](pharmacy-web) | Pharmacies | React + Vite |
| **Admin console** | [`admin-web/`](admin-web) | MedFinder staff | React + Vite |
| **API + database** | [`backend/`](backend) | All three apps | Node.js, Express, SQLite |
| **Stock Sync agent** | [`tools/stock-sync-agent/`](tools/stock-sync-agent) | Pharmacy's own computer | Node.js script, no dependencies |

Design references: [use case diagram](docs/diagrams/use_case_diagram.drawio), [activity diagram](docs/diagrams/activity_diagram.drawio), and the Figma Make prototype. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the parts fit together.

---

## Features

### Patient app (mobile)
- **Sign up with phone + OTP**, log in with phone and password. The app **remembers you**: the session is stored securely on the phone (Keychain / Keystore), so you go straight to Home next time. Your last phone number is pre-filled.
- **Home**: medicines and prices at pharmacies near you, nearby pharmacies (sorted by distance using GPS), popular medicines with "from" prices, other pharmacies, and admin announcements.
- **Search** medicines (or pharmacies by name/area), with recent and popular searches.
- **Compare** every pharmacy that stocks a medicine: price, stock level (Available / Low / Out), distance, delivery fee, and a map. Sort by nearest or cheapest.
- **Pharmacy page**: bio, address, opening hours, phone/WhatsApp, map, directions, and the full list of medicines with prices and stock.
- **Order** from one pharmacy: pickup or delivery, cash or Mobile Money, notes.
- **Track orders** live: placed → accepted → preparing → ready / on the way → completed. Cancel while still pending.
- **Restock alerts**: "Notify me when available" when no pharmacy has a medicine.
- **Notifications**, **report a pharmacy**, edit profile and address, change password, delete account.

### Pharmacy web app
- **Register** the pharmacy (licence, contact, address, map pin from GPS or coordinates, bio, opening hours, delivery fee). It goes live after admin approval.
- **Dashboard**: new orders, today's sales, low stock, orders this week, and medicines patients are looking for.
- **Stock & prices**: add medicines, edit price and quantity in place, low-stock thresholds.
- **Link your database**:
  - Upload **Excel (.xlsx), CSV, or Microsoft Access (.mdb / .accdb)**. Columns are detected automatically (e.g. "Drug Name", "Selling Price", "Qty on hand") with a preview and manual column mapping. Choose *update listed medicines* or *full stock take*.
  - **Automatic sync**: run the Stock Sync agent on the pharmacy computer. It watches the stock file and uploads it every time it is saved, using a private sync key.
- **Orders**: new, in progress and history. Each order shows the **patient's name, phone (call / WhatsApp / SMS), email, delivery address and directions**. Accept or decline, then mark preparing, ready / out for delivery, completed. Stock is reserved when an order is accepted.
- **Subscription** (monthly plan, free trial, billing history) and **profile** settings.

### Admin console
- **Verify pharmacies**: review licence and details, approve, reject (with reason), suspend or reinstate. Pharmacies are notified.
- Watch listings: stock per pharmacy, last stock update, stale listings, complaints.
- **Patients** (suspend / reactivate), **orders** across the platform.
- **Complaints**: investigate, warn the pharmacy, resolve (patient is notified).
- **App control**: switch features on or off for the patient app and pharmacy portal (delivery, Mobile Money, restock alerts, stock import, sync agent, maintenance mode...), add new feature switches, and publish announcements. No app update needed.
- Medicine catalogue clean-up, system settings (subscription price, trial days, support phone, minimum app version), admin accounts and an audit log.

---

## Quick start (local)

Requires **Node.js 22.13 or newer** (the API uses Node's built-in SQLite).

```bash
npm install
```

```bash
npm run seed
```

```bash
npm run dev:api
```

In separate terminals:

```bash
npm run dev:pharmacy
```

```bash
npm run dev:admin
```

- API: http://localhost:4000/api
- Pharmacy web app: http://localhost:5173
- Admin console: http://localhost:5174

### Patient mobile app (on your iPhone or Android phone)

1. Install **Expo Go** from the App Store / Play Store.
2. Put the phone and your computer on the **same Wi-Fi**.
3. Keep the API running (`npm run dev:api` above), then in a new terminal:

```bash
cd mobile && npm install
```

```bash
npx expo start
```

4. **iPhone:** open the Camera app and point it at the QR code in the terminal, then tap the banner to open in Expo Go. **Android:** scan the QR code from inside Expo Go.

The app finds the API on your computer automatically (same address as the Expo server, port 4000). If the app says it can't reach MedFinder:
- Check the phone and computer are on the same Wi-Fi (not a guest network that isolates devices).
- On Windows, allow Node.js through the firewall on private networks (ports 4000 and 8081).
- On iPhone, allow Expo Go's "Local Network" permission (Settings → Expo Go).
- Or set `EXPO_PUBLIC_API_URL` in `mobile/.env` (see `.env.example`).

Press `w` in the Expo terminal to open the app in a browser instead.

### Demo accounts (created by `npm run seed`)

| App | Login | Password |
|---|---|---|
| Admin console | `admin@medfinder.gh` | `Admin@123` |
| Pharmacy web app | `adompharmacy@demo.medfinder.gh` | `Pharmacy@123` |
| Pharmacy waiting for approval | `spintex@demo.medfinder.gh` | `Pharmacy@123` |
| Patient app | `0241234567` | `Patient@123` |

In development the OTP code is shown in the app and printed in the API console, so you don't need SMS. **Change the admin password before going live.**

### Tests

```bash
npm test
```

Runs an end-to-end API test of the full flow: pharmacy signs up → imports Excel/CSV stock → admin approves → patient signs up with OTP → searches → orders → pharmacy fulfils → patient tracks; plus restock alerts, the sync agent endpoint, feature switches, complaints and role checks.

---

## Linking a pharmacy's Excel / Access database

**One-off or occasional updates:** Pharmacy portal → *Import / link database* → drop the file → check columns → *Import*.

**Automatic sync:** on the computer that holds the stock file:

```bash
cd tools/stock-sync-agent
```

```bash
node sync.js --api https://YOUR-SERVER/api --key YOUR_SYNC_KEY --file "C:\Pharmacy\stock.xlsx"
```

The sync key is in the pharmacy portal. Use `--table Stock` for Access databases with several tables, `--mode replace` if the file is the complete stock list, and `--once` to run from Windows Task Scheduler instead of staying open. See [tools/stock-sync-agent/README.md](tools/stock-sync-agent/README.md).

---

## Hosting online

The pharmacy portal and admin console publish to GitHub Pages and the API to Render (free tier). Setup takes a few clicks; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#quick-hosted-demo-render-api--github-pages-web-apps).

## Going to production

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). In short: set `JWT_SECRET`, `ADMIN_EMAIL`/`ADMIN_PASSWORD` and `CORS_ORIGINS`; plug in an SMS provider for OTP (`backend/src/lib/sms.js`) and a payment provider for subscriptions/MoMo; build the web apps; and build the mobile app with EAS.
