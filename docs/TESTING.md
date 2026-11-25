# Testing MedFinder end to end

Use three screens at once: your **phone** (patient), a **laptop browser** (pharmacy) and a **second browser tab or window** (admin). Use a private/incognito window for one of the web apps if you test them in the same browser, so the logins don't mix.

| System | Where | Demo login |
|---|---|---|
| Patient app (phone) | Expo Go, or open `…/MEDFINDER/app/` in Safari | `0241234567` / `Patient@123` |
| Patient app (laptop) | `https://christosdaniel.github.io/MEDFINDER/app/` | same |
| Pharmacy portal | `https://christosdaniel.github.io/MEDFINDER/pharmacy/` | `adompharmacy@demo.medfinder.gh` / `Pharmacy@123` |
| Admin console | `https://christosdaniel.github.io/MEDFINDER/admin/` | `admin@medfinder.gh` / the password you set on Render |

On the free Render plan, the first request after a quiet spell can take up to a minute while the server wakes up.

## Test 1: a new pharmacy joins (pharmacy + admin)
1. **Pharmacy**: sign out, click *Register your pharmacy*, fill in the 3 steps. Use *Use my current location* for the map pin. Tick delivery.
2. You land on the dashboard with a yellow "being reviewed" banner.
3. **Pharmacy**: *Import / link database* → *Download template* → open it in Excel, change some prices/quantities, save as .xlsx, drop it back in → check the columns → *Import*.
4. **Admin**: *Pharmacies* → *Requests* shows your pharmacy → open it → *Approve & go live*.
5. **Pharmacy**: refresh. The banner is gone and the bell shows "Your pharmacy is approved".
6. **Patient**: search a medicine from your file. Your new pharmacy appears with your price.

## Test 2: a patient orders (patient + pharmacy)
1. **Patient**: *Create an account* with your own number (the 6-digit code shows on screen in yellow).
2. Allow location. Home shows pharmacies nearest you.
3. Search *Paracetamol* → compare *Nearest* / *Cheapest* → *Order* → choose *Delivery*, type an address → *Place order*.
4. **Pharmacy** (Adom Pharmacy, or your own): *Orders → New* shows it within 20 seconds with the patient's name, phone and address. Try *Call* / *WhatsApp*.
5. Click *Accept order*, then *Start preparing*, then *Send out for delivery*, then *Mark completed*.
6. **Patient**: the order page updates through each step (it refreshes every 15 seconds) and the bell shows a notification for each one.
7. **Pharmacy**: *Stock & prices*: Paracetamol quantity went down by the amount ordered.

Also try: decline an order with a note (the patient sees the reason), and cancel an order from the patient app while it's still pending.

## Test 3: out of stock and restock alert
1. **Pharmacy**: set a medicine's quantity to 0 at every pharmacy that has it (or pick *Ibuprofen*, which is out everywhere in the demo data).
2. **Patient**: open that medicine → "isn't in stock nearby" → *Notify me when available*.
3. **Pharmacy**: set the quantity back above 0.
4. **Patient**: the bell shows "… is back in stock".

## Test 4: admin controls both apps
1. **Admin**: *App control* → switch off *Home delivery*.
2. **Patient**: close and reopen the app (or refresh the web page) → checkout only allows pickup.
3. **Admin**: publish an announcement for *Both apps* → it appears on the patient home screen and the pharmacy dashboard.
4. **Patient**: on a pharmacy page, *Wrong stock or price? Report it* → send a report.
5. **Admin**: *Complaints* → open it → *Warn pharmacy* → *Resolve*. The pharmacy and patient both get a notification.
6. Switch delivery back on.

## Test 5: the patient is remembered
Close the app completely (or close the browser tab) and open it again: you go straight to Home without logging in. After *Sign out*, the login screen already has your phone number filled in.

## Test 6: pictures
1. **Pharmacy**: *Pharmacy profile* → *Upload picture* (your logo or shopfront).
2. **Pharmacy**: *Stock & prices* → click the letter tile next to a medicine → choose a photo of the pack.
3. **Patient**: the medicine shows the photo on Home, in search, in the price comparison and on the pharmacy page (tap it to enlarge). The pharmacy shows its picture in the lists.
4. **Patient**: *Profile* → *Add a profile photo* → take one or choose from your photos.
5. **Pharmacy**: open that patient's order. Their photo shows next to their name.
6. **Admin**: *Medicines* → edit a medicine → set its default photo, or *Find photo online*.
7. **Automatic photos**: as a pharmacy, *Add medicine* with a common name (e.g. *Amoxicillin 500mg Capsules*) without a photo. Within a minute or two its photo appears, taken from Wikimedia Commons. **Admin** → *Medicines* → *Fill missing photos* does the same for the whole catalogue. Switch it off in *App control* → *Automatic medicine photos*.

## Test 7: automatic stock sync (optional, on the pharmacy laptop)
Follow `tools/stock-sync-agent/README.md`: point the agent at an Excel file with the sync key from *Import / link database*, change a price in Excel and save. Within a minute the new price shows in the patient app.
