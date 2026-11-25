import { createApi } from '@medfinder/web-shared';

export const api = createApi('mf_pharmacy_token');

export type Pharmacy = {
  id: number; name: string; ownerName: string; email: string; phone: string; whatsapp: string | null;
  licenseNumber: string; address: string; area: string | null; city: string; region: string;
  lat: number | null; lng: number | null; bio: string | null; openingHours: string | null;
  offersDelivery: boolean; deliveryFee: number; deliveryRadiusKm: number;
  approvalStatus: 'pending' | 'approved' | 'rejected' | 'suspended'; rejectionReason: string | null;
  subscriptionStatus: 'trial' | 'active' | 'expired'; subscriptionExpiresAt: string | null;
  lastSyncAt: string | null; createdAt: string; approvedAt: string | null; logoImageId: number | null;
};

export type InventoryItem = {
  id: number; medicineId: number; name: string; strength: string; form: string | null; category: string | null;
  requiresPrescription: boolean; price: number; quantity: number; lowStockThreshold: number; sku: string | null;
  stock: string; updatedAt: string; imageId: number | null; catalogueImageId: number | null; catalogueImageCredit: string | null;
};

export type Order = {
  id: number; code: string; status: string; statusText: string; method: 'pickup' | 'delivery';
  deliveryAddress: string | null; deliveryLat: number | null; deliveryLng: number | null;
  paymentMethod: string; paymentStatus: string; subtotal: number; deliveryFee: number; total: number;
  note: string | null; pharmacyNote: string | null; createdAt: string; updatedAt: string;
  items: { medicineId: number; name: string; strength: string; unitPrice: number; quantity: number; imageId: number | null }[];
  timeline: { status: string; statusText: string; note: string | null; at: string }[];
  patient: { id: number; name: string; phone: string; email: string | null; address: string | null; avatarImageId: number | null };
  nextStatuses: string[];
  patientCompletedOrders?: number;
};
