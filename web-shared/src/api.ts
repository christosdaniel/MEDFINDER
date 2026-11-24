// Tiny fetch wrapper shared by the pharmacy and admin web apps.
// The token is kept in localStorage so the browser remembers the login.

export const API_URL: string = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  status: number;
  details?: Record<string, string>;
  constructor(status: number, message: string, details?: Record<string, string>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function createApi(storageKey: string) {
  const getToken = () => {
    try { return localStorage.getItem(storageKey); } catch { return null; }
  };
  const setToken = (t: string | null) => {
    try { t ? localStorage.setItem(storageKey, t) : localStorage.removeItem(storageKey); } catch { /* private mode */ }
  };
  let onUnauthorized: () => void = () => {};

  async function request<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    let res: Response;
    try {
      res = await fetch(API_URL + path, { method, headers, body: payload });
    } catch {
      throw new ApiError(0, 'Cannot reach MedFinder. Check your internet connection.');
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && token) { setToken(null); onUnauthorized(); }
      throw new ApiError(res.status, json.error || `Request failed (${res.status})`, json.details);
    }
    return json as T;
  }

  return {
    getToken,
    setToken,
    setOnUnauthorized: (fn: () => void) => { onUnauthorized = fn; },
    get: <T = any>(p: string) => request<T>('GET', p),
    post: <T = any>(p: string, b?: unknown) => request<T>('POST', p, b ?? {}),
    patch: <T = any>(p: string, b?: unknown) => request<T>('PATCH', p, b ?? {}),
    put: <T = any>(p: string, b?: unknown) => request<T>('PUT', p, b ?? {}),
    del: <T = any>(p: string) => request<T>('DELETE', p),
    /** Download a file from an authenticated endpoint. */
    async download(path: string, filename: string) {
      const token = getToken();
      const res = await fetch(API_URL + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    },
  };
}

export const money = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `GH₵ ${Number(n).toFixed(2)}`);

/** SQLite timestamps are UTC without a zone marker. */
export const parseDate = (s?: string | null) => (s ? new Date(s.includes('T') || s.endsWith('Z') ? s : s.replace(' ', 'T') + 'Z') : null);

export function timeAgo(s?: string | null) {
  const d = parseDate(s);
  if (!d) return '—';
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hr ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)} d ago`;
  return d.toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' });
}
export const fmtDate = (s?: string | null) => parseDate(s)?.toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' }) ?? '—';
export const fmtDateTime = (s?: string | null) => parseDate(s)?.toLocaleString('en-GH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) ?? '—';

/** URL of a stored picture (pharmacy logo, patient photo, medicine photo). */
export const imageUrl = (id?: number | null) => (id ? `${API_URL}/images/${id}` : null);
