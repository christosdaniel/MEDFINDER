// App-wide state: signed-in patient (remembered across launches), location,
// remote config from the admin (feature switches, announcements) and the cart.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as Location from 'expo-location';
import { api, auth, type Patient, type PharmacySummary } from './api';
import { getItem, setItem } from './storage';

export type CartItem = { medicineId: number; name: string; strength: string; price: number; quantity: number };
export type Cart = { pharmacy: PharmacySummary; items: CartItem[] } | null;
type Coords = { lat: number; lng: number; source: 'gps' | 'profile' | 'default' };

// Fallback when location is unavailable: central Accra.
const ACCRA: Coords = { lat: 5.5600, lng: -0.2057, source: 'default' };

type Ctx = {
  ready: boolean;
  patient: Patient | null;
  signIn: (token: string, p: Patient) => Promise<void>;
  signOut: () => Promise<void>;
  setPatient: (p: Patient) => void;
  lastPhone: string | null;
  coords: Coords;
  refreshLocation: () => Promise<void>;
  q: string; // "?lat=..&lng=.." for API calls
  features: Record<string, boolean>;
  announcements: { id: number; title: string; body: string }[];
  supportPhone: string | null;
  cart: Cart;
  addToCart: (pharmacy: PharmacySummary, item: Omit<CartItem, 'quantity'>, qty?: number) => 'added' | 'replaced';
  setQty: (medicineId: number, qty: number) => void;
  clearCart: () => void;
};

const SessionCtx = createContext<Ctx>(null as unknown as Ctx);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [lastPhone, setLastPhone] = useState<string | null>(null);
  const [coords, setCoords] = useState<Coords>(ACCRA);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [announcements, setAnnouncements] = useState<Ctx['announcements']>([]);
  const [supportPhone, setSupportPhone] = useState<string | null>(null);
  const [cart, setCart] = useState<Cart>(null);

  const refreshLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, source: 'gps' });
      // Remember the last location on the profile so the home feed works offline-first next time.
      if (auth.get()) api.patch('/patient/me', { lat: pos.coords.latitude, lng: pos.coords.longitude }).catch(() => {});
    } catch { /* keep fallback */ }
  }, []);

  // On launch: restore the saved token so the patient stays signed in.
  useEffect(() => {
    auth.onUnauthorized(() => setPatient(null));
    (async () => {
      setLastPhone(await getItem('mf_last_phone'));
      api.get('/config?app=patient').then((c) => {
        setFeatures(c.features); setAnnouncements(c.announcements); setSupportPhone(c.settings?.supportPhone ?? null);
      }).catch(() => {});
      const t = await auth.load();
      if (t) {
        try {
          const { patient: p } = await api.get('/patient/me');
          setPatient(p);
          if (p.lat && p.lng) setCoords({ lat: p.lat, lng: p.lng, source: 'profile' });
        } catch { /* token expired */ }
      }
      setReady(true);
      refreshLocation();
    })();
  }, [refreshLocation]);

  const signIn = useCallback(async (token: string, p: Patient) => {
    await auth.set(token);
    await setItem('mf_last_phone', p.phone);
    setLastPhone(p.phone);
    setPatient(p);
    if (p.lat && p.lng && coords.source === 'default') setCoords({ lat: p.lat, lng: p.lng, source: 'profile' });
    refreshLocation();
  }, [coords.source, refreshLocation]);

  const signOut = useCallback(async () => { await auth.set(null); setPatient(null); setCart(null); }, []);

  const addToCart: Ctx['addToCart'] = (pharmacy, item, qty = 1) => {
    const result: 'added' | 'replaced' = cart && cart.pharmacy.id !== pharmacy.id && cart.items.length ? 'replaced' : 'added';
    setCart((c) => {
      if (!c || c.pharmacy.id !== pharmacy.id) {
        return { pharmacy, items: [{ ...item, quantity: qty }] };
      }
      const existing = c.items.find((i) => i.medicineId === item.medicineId);
      const items = existing
        ? c.items.map((i) => (i.medicineId === item.medicineId ? { ...i, quantity: Math.min(100, i.quantity + qty) } : i))
        : [...c.items, { ...item, quantity: qty }];
      return { ...c, items };
    });
    return result;
  };
  const setQty = (medicineId: number, qty: number) => setCart((c) => {
    if (!c) return c;
    const items = qty <= 0 ? c.items.filter((i) => i.medicineId !== medicineId) : c.items.map((i) => (i.medicineId === medicineId ? { ...i, quantity: Math.min(100, qty) } : i));
    return items.length ? { ...c, items } : null;
  });

  const q = `lat=${coords.lat}&lng=${coords.lng}`;
  const value = useMemo<Ctx>(() => ({
    ready, patient, signIn, signOut, setPatient, lastPhone, coords, refreshLocation, q, features, announcements, supportPhone,
    cart, addToCart, setQty, clearCart: () => setCart(null),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [ready, patient, signIn, signOut, lastPhone, coords, refreshLocation, q, features, announcements, supportPhone, cart]);

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export const useSession = () => useContext(SessionCtx);

/** Small data loader with refresh support. */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try { setData(await api.get<T>(path)); setError(null); } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}
