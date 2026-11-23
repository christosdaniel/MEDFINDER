// Creates the first admin account, and (when run directly with `npm run seed`)
// loads demo pharmacies, medicines, stock and a demo patient for testing.
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { db, tx } from './db.js';
import { config } from './config.js';
import { hashPassword } from './lib/auth.js';
import { upsertMedicine } from './lib/stockImport.js';

export async function ensureAdmin() {
  if (db.prepare('SELECT COUNT(*) AS n FROM admins').get().n) return;
  db.prepare('INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)')
    .run(config.admin.name, config.admin.email.toLowerCase(), await hashPassword(config.admin.password));
  console.log(`Created admin account ${config.admin.email} (change the password after first login)`);
}

const MEDICINES = [
  ['Paracetamol', '500mg', 'Tablets', 'Pain & fever', 0],
  ['Amoxicillin', '500mg', 'Capsules', 'Antibiotic', 1],
  ['Coartem', '20/120mg', 'Tablets', 'Antimalarial', 0],
  ['Ibuprofen', '400mg', 'Tablets', 'Pain & fever', 0],
  ['ORS sachets', '10 sachets', 'Powder', 'Rehydration', 0],
  ['Metformin', '500mg', 'Tablets', 'Diabetes', 1],
  ['Amlodipine', '5mg', 'Tablets', 'Blood pressure', 1],
  ['Vitamin C', '1000mg', 'Effervescent tablets', 'Vitamins', 0],
  ['Ciprofloxacin', '500mg', 'Tablets', 'Antibiotic', 1],
  ['Lonart DS', '80/480mg', 'Tablets', 'Antimalarial', 0],
  ['Cetirizine', '10mg', 'Tablets', 'Allergy', 0],
  ['Omeprazole', '20mg', 'Capsules', 'Stomach & acid', 0],
  ['Folic acid', '5mg', 'Tablets', 'Vitamins', 0],
  ['Ferrous sulphate', '200mg', 'Tablets', 'Vitamins', 0],
  ['Salbutamol inhaler', '100mcg', 'Inhaler', 'Asthma', 1],
  ['Cough syrup (Benylin)', '100ml', 'Syrup', 'Cough & cold', 0],
  ['Zinc tablets', '20mg', 'Tablets', 'Vitamins', 0],
  ['Artesunate', '50mg', 'Tablets', 'Antimalarial', 0],
];
const BASE_PRICE = { Paracetamol: 8.5, Amoxicillin: 24, Coartem: 38, Ibuprofen: 12, 'ORS sachets': 15, Metformin: 30, Amlodipine: 28, 'Vitamin C': 35, Ciprofloxacin: 32, 'Lonart DS': 45, Cetirizine: 10, Omeprazole: 20, 'Folic acid': 6, 'Ferrous sulphate': 9, 'Salbutamol inhaler': 65, 'Cough syrup (Benylin)': 40, 'Zinc tablets': 14, Artesunate: 25 };

const PHARMACIES = [
  { name: 'Adom Pharmacy', area: 'Osu', city: 'Accra', lat: 5.5560, lng: -0.1820, delivery: 1, fee: 10, bio: 'Family-run community pharmacy on Oxford Street serving Osu since 2009. Friendly pharmacists and fast service.', hours: 'Mon–Sat 7:00–22:00, Sun 9:00–18:00' },
  { name: 'HealthPlus Chemist', area: 'Labone', city: 'Accra', lat: 5.5660, lng: -0.1710, delivery: 1, fee: 12, bio: 'Licensed chemist with a wide range of everyday medicines and vitamins at fair prices.', hours: 'Daily 8:00–21:00' },
  { name: 'GraceCare Pharmacy', area: 'Cantonments', city: 'Accra', lat: 5.5780, lng: -0.1700, delivery: 0, fee: 0, bio: 'Prescription specialists. Bring your prescription and we will have it ready in minutes.', hours: 'Mon–Fri 8:00–20:00, Sat 9:00–17:00' },
  { name: 'East Legon Wellness Pharmacy', area: 'East Legon', city: 'Accra', lat: 5.6360, lng: -0.1530, delivery: 1, fee: 15, bio: 'Modern pharmacy with free blood pressure checks and home delivery across East Legon.', hours: 'Daily 7:30–23:00' },
  { name: 'Madina Community Pharmacy', area: 'Madina', city: 'Accra', lat: 5.6680, lng: -0.1660, delivery: 1, fee: 8, bio: 'Affordable medicines for the Madina community. Open late every day.', hours: 'Daily 7:00–23:30' },
  { name: 'Achimota Life Pharmacy', area: 'Achimota', city: 'Accra', lat: 5.6130, lng: -0.2300, delivery: 0, fee: 0, bio: 'Trusted neighbourhood pharmacy near Achimota Mall.', hours: 'Mon–Sat 8:00–21:00' },
  { name: 'Dansoman Care Chemist', area: 'Dansoman', city: 'Accra', lat: 5.5480, lng: -0.2620, delivery: 1, fee: 10, bio: 'Your local chemist for everyday health needs.', hours: 'Daily 8:00–20:00' },
  { name: 'Tema Harbour Pharmacy', area: 'Community 1', city: 'Tema', lat: 5.6698, lng: -0.0166, delivery: 1, fee: 12, bio: 'Serving Tema and the harbour area with quality medicines.', hours: 'Mon–Sat 7:00–21:00' },
  { name: 'Adum Royal Pharmacy', area: 'Adum', city: 'Kumasi', lat: 6.6910, lng: -1.6270, delivery: 1, fee: 10, bio: 'Central Kumasi pharmacy with a large stock of antimalarials and antibiotics.', hours: 'Daily 7:00–22:00' },
];

async function seedDemo() {
  await ensureAdmin();
  if (db.prepare('SELECT COUNT(*) AS n FROM pharmacies').get().n) {
    console.log('Database already has pharmacies; skipping demo data.');
    return;
  }
  const pharmacyHash = await hashPassword('Pharmacy@123');
  const patientHash = await hashPassword('Patient@123');
  tx(() => {
    const medIds = MEDICINES.map(([name, strength, form, category, rx]) => [name, upsertMedicine({ name, strength, form, category, requires_prescription: !!rx })]);
    PHARMACIES.forEach((p, idx) => {
      const slug = p.name.toLowerCase().replace(/[^a-z]+/g, '');
      const id = Number(db.prepare(`INSERT INTO pharmacies (name, owner_name, email, phone, password_hash, license_number, address, area, city, region, lat, lng, bio, opening_hours,
          offers_delivery, delivery_fee, approval_status, subscription_status, subscription_expires_at, sync_key, approved_at, last_sync_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'active', datetime('now', '+30 days'), ?, datetime('now'), datetime('now'))`)
        .run(p.name, 'Demo Owner', `${slug}@demo.medfinder.gh`, `+23324${String(1000000 + idx * 1111).slice(0, 7)}`, pharmacyHash, `PC/GH/${2020 + (idx % 5)}/${1000 + idx}`,
          `${10 + idx} Main Street, ${p.area}`, p.area, p.city, p.city === 'Kumasi' ? 'Ashanti' : 'Greater Accra', p.lat, p.lng, p.bio, p.hours, p.delivery, p.fee,
          `mfsync_${crypto.randomBytes(24).toString('hex')}`).lastInsertRowid);
      // Each pharmacy stocks most medicines with slightly different prices and quantities.
      medIds.forEach(([name, mid], j) => {
        if ((idx + j) % 5 === 4) return; // not every pharmacy sells everything
        const price = Math.round(BASE_PRICE[name] * (0.9 + ((idx * 7 + j * 3) % 5) * 0.06) * 2) / 2;
        const qty = name === 'Ibuprofen' ? 0 : ((idx * 13 + j * 17) % 90) + ((idx + j) % 6 === 5 ? 0 : 6);
        db.prepare('INSERT INTO inventory (pharmacy_id, medicine_id, price, quantity, low_stock_threshold) VALUES (?, ?, ?, ?, 10)').run(id, mid, price, qty);
      });
    });
    // One pharmacy waiting for approval so the admin flow can be tested.
    db.prepare(`INSERT INTO pharmacies (name, owner_name, email, phone, password_hash, license_number, address, area, city, lat, lng, bio, offers_delivery, sync_key, subscription_expires_at)
      VALUES ('Spintex MedPoint', 'Kofi Asante', 'spintex@demo.medfinder.gh', '+233244555666', ?, 'PC/GH/2024/2210', 'Spintex Road, near Coca-Cola roundabout', 'Spintex', 'Accra', 5.6400, -0.1000,
      'New pharmacy on Spintex Road.', 1, ?, datetime('now', '+30 days'))`).run(pharmacyHash, `mfsync_${crypto.randomBytes(24).toString('hex')}`);

    db.prepare(`INSERT INTO patients (first_name, last_name, phone, email, password_hash, phone_verified, address, lat, lng)
      VALUES ('Ama', 'Mensah', '+233241234567', 'ama@example.com', ?, 1, 'Osu, Accra', 5.5570, -0.1800)`).run(patientHash);
    db.prepare(`INSERT INTO announcements (title, body, audience) VALUES ('Welcome to MedFinder Ghana', 'Find medicine fast at pharmacies near you. Pickup or delivery.', 'patient')`).run();
  });
  console.log(`Demo data loaded:
  Admin     ${config.admin.email} / ${config.admin.password}
  Pharmacy  adompharmacy@demo.medfinder.gh / Pharmacy@123   (pending: spintex@demo.medfinder.gh)
  Patient   0241234567 / Patient@123`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await seedDemo();
}
