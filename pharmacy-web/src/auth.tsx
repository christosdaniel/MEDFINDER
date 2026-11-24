import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Pharmacy } from './api';

type Ctx = {
  pharmacy: Pharmacy | null;
  ready: boolean;
  features: Record<string, boolean>;
  announcements: { id: number; title: string; body: string }[];
  signIn: (token: string, p: Pharmacy) => void;
  signOut: () => void;
  refresh: () => Promise<void>;
  setPharmacy: (p: Pharmacy) => void;
};
const AuthCtx = createContext<Ctx>(null as unknown as Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null);
  const [ready, setReady] = useState(false);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [announcements, setAnnouncements] = useState<Ctx['announcements']>([]);

  const refresh = useCallback(async () => {
    if (!api.getToken()) { setPharmacy(null); return; }
    try { setPharmacy((await api.get('/pharmacy/me')).pharmacy); } catch { setPharmacy(null); }
  }, []);

  useEffect(() => {
    api.setOnUnauthorized(() => setPharmacy(null));
    api.get('/config?app=pharmacy').then((c) => { setFeatures(c.features); setAnnouncements(c.announcements); }).catch(() => {});
    refresh().finally(() => setReady(true));
  }, [refresh]);

  const signIn = (token: string, p: Pharmacy) => { api.setToken(token); setPharmacy(p); };
  const signOut = () => { api.setToken(null); setPharmacy(null); };

  return <AuthCtx.Provider value={{ pharmacy, ready, features, announcements, signIn, signOut, refresh, setPharmacy }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
