import Constants from 'expo-constants';
import { getItem, setItem } from './storage';

// Where the API lives:
// 1. EXPO_PUBLIC_API_URL if set (see .env.example), e.g. your production server.
// 2. In development on a real phone (Expo Go), the computer running `expo start`:
//    Expo tells us its LAN address (e.g. 192.168.1.20:8081), and the API runs on port 4000 there.
// 3. Fallback from app.json (localhost, for the web build / simulators).
function devServerApi(): string | null {
  const hostUri = Constants.expoConfig?.hostUri; // "192.168.1.20:8081"
  const host = hostUri?.split(':')[0];
  if (!host || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.exp.direct')) return null;
  return `http://${host}:4000/api`;
}
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL || devServerApi() || (Constants.expoConfig?.extra as any)?.apiUrl || 'http://localhost:4000/api';

const TOKEN_KEY = 'mf_patient_token';
let token: string | null = null;
let onUnauthorized: () => void = () => {};

export const auth = {
  async load() { token = await getItem(TOKEN_KEY); return token; },
  async set(t: string | null) { token = t; await setItem(TOKEN_KEY, t); },
  get: () => token,
  onUnauthorized(fn: () => void) { onUnauthorized = fn; },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(API_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'Cannot reach MedFinder. Check your internet connection and try again.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) { await auth.set(null); onUnauthorized(); }
    throw new ApiError(res.status, json.error || 'Something went wrong');
  }
  return json as T;
}

/** URL of a stored picture (pharmacy logo, patient photo, medicine photo). */
export const imageUrl = (id?: number | null) => (id ? `${API_URL}/images/${id}` : null);

/** Upload a picked photo. On phones we send the file URI; on the web build, the File itself. */
async function uploadImage<T = any>(path: string, asset: { uri: string; file?: File | null; mimeType?: string | null; fileName?: string | null }): Promise<T> {
  const fd = new FormData();
  if (asset.file) fd.append('image', asset.file);
  else fd.append('image', { uri: asset.uri, name: asset.fileName || 'photo.jpg', type: asset.mimeType || 'image/jpeg' } as any);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try { res = await fetch(API_URL + path, { method: 'POST', headers, body: fd }); }
  catch { throw new ApiError(0, 'Cannot reach MedFinder. Check your internet connection and try again.'); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error || 'Upload failed');
  return json as T;
}

export const api = {
  upload: uploadImage,
  get: <T = any>(p: string) => request<T>('GET', p),
  post: <T = any>(p: string, b: unknown = {}) => request<T>('POST', p, b),
  patch: <T = any>(p: string, b: unknown = {}) => request<T>('PATCH', p, b),
  put: <T = any>(p: string, b: unknown = {}) => request<T>('PUT', p, b),
  del: <T = any>(p: string, b?: unknown) => request<T>('DELETE', p, b),
};

// ----- Types -----
export type Patient = {
  id: number; firstName: string; lastName: string; phone: string; email: string | null; age: number | null;
  address: string | null; lat: number | null; lng: number | null; phoneVerified: boolean; createdAt: string; avatarImageId: number | null;
};
export type PharmacySummary = {
  id: number; name: string; address: string; area: string | null; city: string; region: string; phone: string; whatsapp: string | null;
  lat: number | null; lng: number | null; bio: string | null; openingHours: string | null; offersDelivery: boolean; deliveryFee: number;
  distanceKm: number | null; logoImageId: number | null;
};
export type MedicineSummary = {
  id: number; name: string; strength: string; form: string | null; category: string | null;
  pharmacies?: number; minPrice?: number | null; requiresPrescription?: boolean; imageId?: number | null;
};
export type StockLine = {
  inventoryId: number; medicine: MedicineSummary; price: number; stock: 'Available' | 'Low stock' | 'Out of stock'; updatedAt?: string; imageId?: number | null;
};
export type Order = {
  id: number; code: string; status: string; statusText: string; method: 'pickup' | 'delivery'; deliveryAddress: string | null;
  paymentMethod: string; paymentStatus: string; subtotal: number; deliveryFee: number; total: number; note: string | null; pharmacyNote: string | null;
  createdAt: string; updatedAt: string; canCancel: boolean;
  items: { medicineId: number; name: string; strength: string; unitPrice: number; quantity: number; imageId?: number | null }[];
  timeline: { status: string; statusText: string; note: string | null; at: string }[];
  pharmacy: { id: number; name: string; phone: string; address: string; area: string | null; lat: number | null; lng: number | null; logoImageId?: number | null };
};
