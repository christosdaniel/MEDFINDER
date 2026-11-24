# MedFinder architecture

```
 Patient mobile app (Expo)          Pharmacy web app (React)        Admin console (React)
          │                                   │                               │
          └──────────── HTTPS / JSON ─────────┼───────────────────────────────┘
                                              ▼
                                MedFinder API (Express, Node 22)
                                              │
                                     SQLite database (WAL)
                                              ▲
                Stock Sync agent ── X-Sync-Key ┘   (runs on the pharmacy's PC,
                                                    uploads Excel/CSV/Access file)
```

## API areas (`backend/src/routes`)

| Prefix | File | Auth | Purpose |
|---|---|---|---|
| `/api/config`, `/api/home`, `/api/medicines/*`, `/api/pharmacies/*` | `public.js` | none (optional patient token) | App config & feature switches, home feed, medicine search & comparison, pharmacy directory and stock |
| `/api/patient/*` | `patient.js` | patient JWT (90 days) | Sign-up + OTP, login, profile, orders, notifications, restock alerts, favourites, complaints |
| `/api/pharmacy/*` | `pharmacy.js` | pharmacy JWT (30 days) | Registration, profile & location, inventory, file import, sync key, orders, subscription |
| `/api/admin/*` | `admin.js` | admin JWT (12 hours) | Verification, patients, orders, complaints, feature switches, announcements, catalogue, settings, audit |
| `/api/sync/*` | `sync.js` | `X-Sync-Key` header | Stock Sync agent uploads |

Only pharmacies that are **approved** and whose subscription has **not expired** are visible to patients.

## Data model (`backend/src/db.js`)

- `patients`, `otp_codes`: patient accounts (bcrypt passwords, verified phone).
- `pharmacies`: details, location (lat/lng), bio, hours, delivery, approval status, subscription, sync key.
- `medicines`: shared catalogue (name + strength, unique ignoring case). Grows as pharmacies add stock.
- `inventory`: price, quantity and low-stock threshold per pharmacy per medicine.
- `orders`, `order_items`, `order_events`: orders with price snapshot and status timeline.
- `notifications`: in-app notifications for patients, pharmacies and admins.
- `restock_alerts`, `recent_searches`, `favorites`, `complaints`.
- `subscription_payments`, `import_logs`.
- `feature_flags`, `announcements`, `settings`, `audit_log`: admin controls.

## Order lifecycle

```
pending ──accept──▶ accepted ──▶ preparing ──▶ ready (pickup) ──────────▶ completed
   │                   │             │       └▶ out_for_delivery ───────▶ completed
   └─decline─▶ rejected└─cancel──────┴─▶ cancelled
patient can cancel while pending/accepted
```

Stock is deducted when the pharmacy **accepts** (so it can't be sold twice) and returned if the order is cancelled afterwards. Every change notifies the patient.

## Stock import

`backend/src/lib/stockImport.js` reads `.xlsx` (ExcelJS), `.csv` (csv-parse) and `.mdb/.accdb` (mdb-reader), detects the name / strength / price / quantity columns from common header names, splits "Paracetamol 500mg" into name + strength when there is no strength column, and upserts inventory in a transaction. `replace` mode zeroes items missing from the file. After every update, waiting restock alerts fire and low-stock notifications are sent.

## How the apps "remember" users

- Mobile: JWT stored in `expo-secure-store`; on launch the app calls `/patient/me` and goes straight to Home. The last phone number is saved to pre-fill login.
- Web apps: JWT stored in `localStorage`; a 401 response signs the user out.

## Why SQLite

It needs no separate database server, is fast for this workload, and is easy to back up (one file). To scale beyond one server, move the same schema to PostgreSQL; queries are plain SQL.
