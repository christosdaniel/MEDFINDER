import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, Card, Chip, Empty, ErrorBox, Header, Loading, s } from '../../components/ui';
import MedicineIcon from '../../components/MedicineIcon';
import { PhotoViewer, ProfilePic } from '../../components/Photo';
import PharmacyMap from '../../components/PharmacyMap';
import { api, type MedicineSummary, type PharmacySummary } from '../../lib/api';
import { useApi, useSession } from '../../lib/session';
import { colors, km, money, timeAgo } from '../../lib/theme';
import { confirmBox, show } from '../../lib/dialog';

type Resp = {
  medicine: MedicineSummary & { description: string | null };
  available: boolean;
  cheapest: number | null;
  pharmacies: { inventoryId: number; price: number; stock: string; stockUpdatedAt: string; pharmacy: PharmacySummary; imageId?: number | null; imageCredit?: string | null }[];
};

/** Compare every pharmacy that stocks this medicine (activity diagram: "Compare & route"). */
export default function MedicineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { q, coords, addToCart, cart, features } = useSession();
  const [sort, setSort] = useState<'distance' | 'price'>('distance');
  const [alertSet, setAlertSet] = useState(false);
  const [viewing, setViewing] = useState<{ id: number; title: string; credit?: string | null } | null>(null);
  const { data, loading, error } = useApi<Resp>(`/medicines/${id}/pharmacies?${q}&sort=${sort}`, [id, q, sort]);

  const notify = async () => {
    try { await api.post('/patient/restock-alerts', { medicineId: Number(id) }); setAlertSet(true); } catch (e: any) { show('Could not set alert', e.message); }
  };

  const add = (row: Resp['pharmacies'][number]) => {
    const m = data!.medicine;
    const doAdd = () => {
      addToCart(row.pharmacy, { medicineId: m.id, name: m.name, strength: m.strength, price: row.price, imageId: row.imageId ?? m.imageId });
      router.push('/checkout');
    };
    if (cart && cart.pharmacy.id !== row.pharmacy.id) {
      confirmBox('Start a new cart?', `Your cart has items from ${cart.pharmacy.name}. Orders are placed with one pharmacy at a time.`, doAdd);
    } else doAdd();
  };

  const inStock = data?.pharmacies.filter((p) => p.stock !== 'Out of stock') || [];
  const pins = inStock.filter((p) => p.pharmacy.lat).slice(0, 15).map((p) => ({ id: p.pharmacy.id, lat: p.pharmacy.lat!, lng: p.pharmacy.lng!, title: p.pharmacy.name, subtitle: money(p.price) }));

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title={data ? `${data.medicine.name} ${data.medicine.strength}` : 'Medicine'} subtitle={data ? `${inStock.length} pharmacies have it` : undefined} />
      {loading && !data ? <Loading /> : error ? <View style={s.pad}><ErrorBox text={error} /></View> : data && (
        <ScrollView contentContainerStyle={[s.pad, { paddingBottom: 40 }]}>
          <Card style={[s.row, { gap: 14 }]}>
            <Pressable onPress={() => data.medicine.imageId && setViewing({ id: data.medicine.imageId, title: `${data.medicine.name} ${data.medicine.strength}`, credit: data.medicine.imageCredit })}>
              <MedicineIcon name={data.medicine.name} imageId={data.medicine.imageId} size={72} />
            </Pressable>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.h2}>{data.medicine.name}</Text>
              <Text style={s.muted}>{[data.medicine.strength, data.medicine.form, data.medicine.category].filter(Boolean).join(' · ')}</Text>
              {data.medicine.requiresPrescription && <Badge label="Prescription needed at pickup" tone="blue" />}
            </View>
            {data.cheapest !== null && <View style={{ alignItems: 'flex-end' }}><Text style={[s.muted, { fontSize: 11 }]}>from</Text><Text style={{ fontSize: 18, fontWeight: '800', color: colors.green }}>{money(data.cheapest)}</Text></View>}
          </Card>
          {data.medicine.imageCredit && <Text style={[s.muted, { fontSize: 11, marginTop: -10 }]}>{data.medicine.imageCredit}</Text>}
          {data.medicine.description && <Text style={s.body}>{data.medicine.description}</Text>}

          {!data.available ? (
            <Card style={{ gap: 12, alignItems: 'center', paddingVertical: 24 }}>
              <View style={{ width: 60, height: 60, borderRadius: 18, backgroundColor: colors.amber, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="alert-circle-outline" size={30} color={colors.amberText} /></View>
              <Text style={[s.h2, { textAlign: 'center' }]}>This medicine isn't in stock nearby right now</Text>
              <Text style={[s.muted, { textAlign: 'center' }]}>We'll let you know as soon as a pharmacy restocks it.</Text>
              {features.restock_alerts !== false && (alertSet
                ? <Badge label="✓ We'll notify you" tone="green" />
                : <Button title="Notify me when available" icon="notifications-outline" onPress={notify} />)}
              <Button title="Search for an alternative" variant="secondary" onPress={() => router.push('/(tabs)/search')} />
            </Card>
          ) : (
            <>
              {pins.length > 0 && <PharmacyMap pins={pins} me={coords.source !== 'default' ? coords : null} height={190} onPressPin={(pid) => router.push(`/pharmacy/${pid}`)} />}
              <View style={s.rowBetween}>
                <Text style={s.h3}>Compare pharmacies</Text>
                <View style={s.row}>
                  <Chip label="Nearest" active={sort === 'distance'} onPress={() => setSort('distance')} />
                  <Chip label="Cheapest" active={sort === 'price'} onPress={() => setSort('price')} />
                </View>
              </View>
            </>
          )}

          {data.pharmacies.length === 0 && data.available && <Empty title="No pharmacies yet" />}
          {data.pharmacies.map((row, idx) => {
            const out = row.stock === 'Out of stock';
            const best = !out && row.price === data.cheapest;
            return (
              <Card key={row.inventoryId} style={[{ gap: 10 }, out && { opacity: 0.6 }]}>
                <Pressable onPress={() => router.push(`/pharmacy/${row.pharmacy.id}`)} style={s.rowBetween}>
                  <ProfilePic imageId={row.pharmacy.logoImageId} label={row.pharmacy.name} size={42} round={false} icon="storefront" />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.h3}>{row.pharmacy.name}</Text>
                    <Text style={s.muted}>{[row.pharmacy.area, row.pharmacy.city].filter(Boolean).join(', ')} · {km(row.pharmacy.distanceKm)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: colors.green }}>{money(row.price)}</Text>
                    {best && <Text style={{ fontSize: 11, color: colors.green2, fontWeight: '700' }}>BEST PRICE</Text>}
                    {idx === 0 && sort === 'distance' && !out && !best && <Text style={{ fontSize: 11, color: colors.blue, fontWeight: '700' }}>NEAREST</Text>}
                  </View>
                </Pressable>
                {row.imageId && row.imageId !== data.medicine.imageId && (
                  <Pressable onPress={() => setViewing({ id: row.imageId!, title: `${data.medicine.name} at ${row.pharmacy.name}`, credit: row.imageCredit })} style={[s.row, { gap: 8 }]}>
                    <MedicineIcon name={data.medicine.name} imageId={row.imageId} size={48} />
                    <Text style={[s.muted, { fontSize: 12 }]}>Their pack · tap to enlarge</Text>
                  </Pressable>
                )}
                <View style={[s.row, { flexWrap: 'wrap' }]}>
                  <Badge label={row.stock} />
                  {row.pharmacy.offersDelivery ? <Badge label={`Delivery ${money(row.pharmacy.deliveryFee)}`} tone="blue" /> : <Badge label="Pickup only" tone="grey" />}
                  <Text style={[s.muted, { fontSize: 12 }]}>Updated {timeAgo(row.stockUpdatedAt)}</Text>
                </View>
                {!out && (
                  <View style={s.row}>
                    <Button title="Order" icon="cart-outline" small onPress={() => add(row)} style={{ flex: 1 }} />
                    <Button title="View pharmacy" variant="secondary" small onPress={() => router.push(`/pharmacy/${row.pharmacy.id}`)} style={{ flex: 1 }} />
                  </View>
                )}
              </Card>
            );
          })}
        </ScrollView>
      )}
      <PhotoViewer imageId={viewing?.id ?? null} title={viewing?.title} credit={viewing?.credit} onClose={() => setViewing(null)} />
    </SafeAreaView>
  );
}
