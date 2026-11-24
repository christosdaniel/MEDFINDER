import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Admin } from './api';

type Ctx = { admin: Admin | null; ready: boolean; signIn: (t: string, a: Admin) => void; signOut: () => void };
const AuthCtx = createContext<Ctx>(null as unknown as Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    api.setOnUnauthorized(() => setAdmin(null));
    if (!api.getToken()) { setReady(true); return; }
    api.get('/admin/me').then((r) => setAdmin(r.admin)).catch(() => setAdmin(null)).finally(() => setReady(true));
  }, []);
  return (
    <AuthCtx.Provider value={{
      admin, ready,
      signIn: (t, a) => { api.setToken(t); setAdmin(a); },
      signOut: () => { api.setToken(null); setAdmin(null); },
    }}>{children}</AuthCtx.Provider>
  );
}
export const useAuth = () => useContext(AuthCtx);
