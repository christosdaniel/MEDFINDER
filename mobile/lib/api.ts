import Constants from 'expo-constants';
import { getItem, setItem } from './storage';

// Set EXPO_PUBLIC_API_URL (see .env.example) to point the app at your API.
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL || (Constants.expoConfig?.extra as any)?.apiUrl || 'http://localhost:4000/api';

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

export const api = {
  get: <T = any>(p: string) => request<T>('GET', p),
  post: <T = any>(p: string, b: unknown = {}) => request<T>('POST', p, b),
  patch: <T = any>(p: string, b: unknown = {}) => request<T>('PATCH', p, b),
  put: <T = any>(p: string, b: unknown = {}) => request<T>('PUT', p, b),
  del: <T = any>(p: string, b?: unknown) => request<T>('DELETE', p, b),
};

// ----- Types -----
export type Patient = {
  id: number; firstName: string; lastName: string; phone: string; email: string | null; age: number | null;
  address: string | null; lat: number | null; lng: number | null; phoneVerified: boolean; createdAt: string;
};
export type PharmacySummary = {
  id: number; name: string; address: string; area: string | null; city: string; region: string; phone: string; whatsapp: string | null;
  lat: number | null; lng: number | null; bio: string | null; openingHours: string | null; offersDelivery: boolean; deliveryFee: number;
  distanceKm: number | null;
};
export type MedicineSummary = {
  id: number; name: string; strength: string; form: string | null; category: string | null;
  pharmacies?: number; minPrice?: number | null; requiresPrescription?: boolean;
};
export type StockLine = {
  inventoryId: number; medicine: MedicineSummary; price: number; stock: 'Available' | 'Low stock' | 'Out of stock'; updatedAt?: string;
};
export type Order = {
  id: number; code: string; status: string; statusText: string; method: 'pickup' | 'delivery'; deliveryAddress: string | null;
  paymentMethod: string; paymentStatus: string; subtotal: number; deliveryFee: number; total: number; note: string | null; pharmacyNote: string | null;
  createdAt: string; updatedAt: string; canCancel: boolean;
  items: { medicineId: number; name: string; strength: string; unitPrice: number; quantity: number }[];
  timeline: { status: string; statusText: string; note: string | null; at: string }[];
  pharmacy: { id: number; name: string; phone: string; address: string; area: string | null; lat: number | null; lng: number | null };
};
