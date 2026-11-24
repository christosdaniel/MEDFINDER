import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Button, Card, Empty, ErrorBox, Header, Input, s } from '../components/ui';
import { api } from '../lib/api';
import MedicineIcon from '../components/MedicineIcon';
import { useSession } from '../lib/session';
import { colors, money } from '../lib/theme';

/** Choose pickup or delivery, payment, review and place the order. */
export default function Checkout() {
  const router = useRouter();
  const { cart, setQty, clearCart, patient, coords, features } = useSession();
  const [method, setMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [payment, setPayment] = useState<'cash' | 'momo'>('cash');
  const [address, setAddress] = useState(patient?.address || '');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!cart) {
    return (
      <SafeAreaView style={s.screen}>
        <Header title="Your cart" />
        <Empty icon="cart-outline" title="Your cart is empty" text="Find a medicine and add it from a pharmacy." action={<Button title="Search medicines" onPress={() => router.replace('/(tabs)/search')} />} />
      </SafeAreaView>
    );
  }
  const p = cart.pharmacy;
  const canDeliver = p.offersDelivery && features.delivery !== false;
  const subtotal = cart.items.reduce((t, i) => t + i.price * i.quantity, 0);
  const fee = method === 'delivery' ? p.deliveryFee : 0;

  const place = async () => {
    setBusy(true); setError('');
    try {
      const r = await api.post('/patient/orders', {
        pharmacyId: p.id,
        method,
        deliveryAddress: method === 'delivery' ? address : undefined,
        deliveryLat: method === 'delivery' && coords.source === 'gps' ? coords.lat : undefined,
        deliveryLng: method === 'delivery' && coords.source === 'gps' ? coords.lng : undefined,
        paymentMethod: payment,
        note: note || undefined,
        items: cart.items.map((i) => ({ medicineId: i.medicineId, quantity: i.quantity })),
      });
      if (method === 'delivery' && address && address !== patient?.address) api.patch('/patient/me', { address }).catch(() => {});
      clearCart();
      router.replace({ pathname: '/order/[id]', params: { id: String(r.order.id), placed: '1' } });
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <Header title="Checkout" subtitle={p.name} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[s.pad, { paddingBottom: 30 }]} keyboardShouldPersistTaps="handled">
          <Card style={{ gap: 4, paddingVertical: 6 }}>
            {cart.items.map((i, idx) => (
              <View key={i.medicineId} style={[s.row, { paddingVertical: 10 }, idx > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                <MedicineIcon name={i.name} imageId={i.imageId} size={44} />
                <View style={{ flex: 1 }}><Text style={s.h3}>{i.name} <Text style={s.muted}>{i.strength}</Text></Text><Text style={s.muted}>{money(i.price)} each</Text></View>
                <View style={[s.row, { gap: 6 }]}>
                  <Pressable onPress={() => setQty(i.medicineId, i.quantity - 1)} style={step}><Ionicons name={i.quantity === 1 ? 'trash-outline' : 'remove'} size={16} color={colors.green} /></Pressable>
                  <Text style={{ fontWeight: '700', minWidth: 18, textAlign: 'center' }}>{i.quantity}</Text>
                  <Pressable onPress={() => setQty(i.medicineId, i.quantity + 1)} style={step}><Ionicons name="add" size={16} color={colors.green} /></Pressable>
                </View>
              </View>
            ))}
            <Pressable onPress={() => router.push(`/pharmacy/${p.id}`)} style={{ paddingVertical: 10 }}><Text style={{ color: colors.green3, fontWeight: '600' }}>+ Add more from {p.name}</Text></Pressable>
          </Card>

          <Text style={s.h3}>How do you want to get it?</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Option active={method === 'pickup'} icon="storefront-outline" title="Pickup" sub="Collect at the pharmacy" onPress={() => setMethod('pickup')} />
            <Option active={method === 'delivery'} icon="bicycle-outline" title="Delivery" sub={canDeliver ? `Fee ${money(p.deliveryFee)}` : 'Not available'} disabled={!canDeliver} onPress={() => setMethod('delivery')} />
          </View>
          {method === 'pickup' ? (
            <Card style={[s.row, { alignItems: 'flex-start' }]}><Ionicons name="location-outline" size={20} color={colors.green3} /><View style={{ flex: 1 }}><Text style={s.h3}>{p.name}</Text><Text style={s.muted}>{p.address}{p.area ? `, ${p.area}` : ''}</Text>{p.openingHours && <Text style={s.muted}>{p.openingHours}</Text>}</View></Card>
          ) : (
            <Input label="Delivery address" icon="home-outline" value={address} onChangeText={setAddress} placeholder="House number, street, landmark" multiline hint={coords.source === 'gps' ? 'Your GPS location is shared with the rider.' : undefined} />
          )}

          <Text style={s.h3}>Payment</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Option active={payment === 'cash'} icon="cash-outline" title="Cash" sub={method === 'pickup' ? 'Pay at pickup' : 'Pay on delivery'} onPress={() => setPayment('cash')} />
            {features.momo_payments !== false && <Option active={payment === 'momo'} icon="phone-portrait-outline" title="Mobile Money" sub="Pay the pharmacy by MoMo" onPress={() => setPayment('momo')} />}
          </View>
          <Input label="Note for the pharmacy (optional)" value={note} onChangeText={setNote} placeholder="e.g. I'll come after 5pm" />

          <Card style={{ gap: 8 }}>
            <Row label="Subtotal" value={money(subtotal)} />
            {method === 'delivery' && <Row label="Delivery fee" value={money(fee)} />}
            <View style={s.divider} />
            <Row label="Total" value={money(subtotal + fee)} bold />
          </Card>
          {!!error && <ErrorBox text={error} />}
          <Button title={`Place order · ${money(subtotal + fee)}`} onPress={place} loading={busy} disabled={features.maintenance_mode || (method === 'delivery' && address.trim().length < 5)} />
          <Text style={[s.muted, { textAlign: 'center', fontSize: 12 }]}>The pharmacy confirms your order and you'll get updates here. Prescription medicines need a valid prescription at pickup or delivery.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const step = { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: colors.line, alignItems: 'center' as const, justifyContent: 'center' as const };

function Option({ active, icon, title, sub, onPress, disabled }: { active: boolean; icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[s.card, { flex: 1, gap: 6, padding: 14 }, active && { borderColor: colors.green2, backgroundColor: colors.tint2, borderWidth: 2 }, disabled && { opacity: 0.45 }]}>
      <Ionicons name={icon} size={22} color={active ? colors.green : colors.muted} />
      <Text style={s.h3}>{title}</Text>
      <Text style={[s.muted, { fontSize: 12 }]}>{sub}</Text>
    </Pressable>
  );
}
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <View style={s.rowBetween}><Text style={bold ? s.h3 : s.muted}>{label}</Text><Text style={bold ? [s.h3, { color: colors.green }] : s.body}>{value}</Text></View>;
}
