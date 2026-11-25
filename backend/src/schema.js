// PostgreSQL schema. Safe to run on every start (IF NOT EXISTS everywhere).
// Timestamps are timestamptz (UTC); booleans kept as 0/1 integers for simplicity.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS images (
  id SERIAL PRIMARY KEY,
  owner_type TEXT NOT NULL,                 -- pharmacy_logo | patient_avatar | inventory | medicine
  owner_id INTEGER NOT NULL,
  mime TEXT NOT NULL,
  data BYTEA NOT NULL,
  width INTEGER,
  height INTEGER,
  source_url TEXT,                          -- credit for photos imported from Wikimedia Commons
  author TEXT,
  license TEXT,
  auto INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  age INTEGER,
  password_hash TEXT NOT NULL,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  phone_verified INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',    -- active | suspended
  push_token TEXT,
  avatar_image_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id SERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,                    -- verify | reset
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes (phone, purpose);

CREATE TABLE IF NOT EXISTS pharmacies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  whatsapp TEXT,
  password_hash TEXT NOT NULL,
  license_number TEXT NOT NULL,
  address TEXT NOT NULL,
  area TEXT,
  city TEXT NOT NULL DEFAULT 'Accra',
  region TEXT NOT NULL DEFAULT 'Greater Accra',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  bio TEXT,
  opening_hours TEXT,
  offers_delivery INTEGER NOT NULL DEFAULT 0,
  delivery_fee DOUBLE PRECISION NOT NULL DEFAULT 0,
  delivery_radius_km DOUBLE PRECISION NOT NULL DEFAULT 5,
  approval_status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | suspended
  rejection_reason TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'trial', -- trial | active | expired
  subscription_expires_at TIMESTAMPTZ,
  sync_key TEXT UNIQUE,
  last_sync_at TIMESTAMPTZ,
  logo_image_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medicines (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  strength TEXT NOT NULL DEFAULT '',
  form TEXT,
  category TEXT,
  requires_prescription INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  image_id INTEGER,
  photo_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS medicines_name_strength ON medicines (lower(name), lower(strength));

CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  pharmacy_id INTEGER NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  price DOUBLE PRECISION NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 10,
  sku TEXT,
  image_id INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pharmacy_id, medicine_id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_medicine ON inventory (medicine_id);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  pharmacy_id INTEGER NOT NULL REFERENCES pharmacies(id),
  method TEXT NOT NULL,                     -- pickup | delivery
  delivery_address TEXT,
  delivery_lat DOUBLE PRECISION,
  delivery_lng DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT NOT NULL DEFAULT 'cash',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  subtotal DOUBLE PRECISION NOT NULL,
  delivery_fee DOUBLE PRECISION NOT NULL DEFAULT 0,
  total DOUBLE PRECISION NOT NULL,
  note TEXT,
  pharmacy_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_pharmacy ON orders (pharmacy_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_patient ON orders (patient_id);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id),
  name TEXT NOT NULL,
  strength TEXT,
  unit_price DOUBLE PRECISION NOT NULL,
  quantity INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_events (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  recipient_type TEXT NOT NULL,             -- patient | pharmacy | admin
  recipient_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications (recipient_type, recipient_id, read);

CREATE TABLE IF NOT EXISTS restock_alerts (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at TIMESTAMPTZ,
  UNIQUE (patient_id, medicine_id)
);

CREATE TABLE IF NOT EXISTS recent_searches (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS favorites (
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  pharmacy_id INTEGER NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (patient_id, pharmacy_id)
);

CREATE TABLE IF NOT EXISTS complaints (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  pharmacy_id INTEGER REFERENCES pharmacies(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',      -- open | investigating | resolved
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS subscription_payments (
  id SERIAL PRIMARY KEY,
  pharmacy_id INTEGER NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL,
  months INTEGER NOT NULL DEFAULT 1,
  method TEXT NOT NULL,
  reference TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_logs (
  id SERIAL PRIMARY KEY,
  pharmacy_id INTEGER NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  filename TEXT,
  rows_total INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  zeroed_count INTEGER NOT NULL DEFAULT 0,
  errors TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  audience TEXT NOT NULL DEFAULT 'all',     -- patient | pharmacy | all
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER,
  action TEXT NOT NULL,
  target TEXT,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supabase exposes the public schema through its web API (PostgREST) to anyone
-- holding the project's anon key. Only the MedFinder server should touch this
-- data, so: row level security on with no policies (blocks the API roles), and
-- no table privileges for those roles. The server connects as the database
-- owner, which is not affected.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
  END IF;
END $$;
`;
