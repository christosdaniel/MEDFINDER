import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, Card, ErrorBox, Header, Loading, s } from '../../components/ui';
import MedicineIcon from '../../components/MedicineIcon';
import { PhotoViewer, ProfilePic } from '../../components/Photo';
import PharmacyMap from '../../components/PharmacyMap';
import { api, type PharmacySummary, type StockLine } from '../../lib/api';
import { useApi, useSession } from '../../lib/session';
import { colors, km, money, timeAgo } from '../../lib/theme';
import { confirmBox } from '../../lib/dialog';

type Resp = { pharmacy: PharmacySummary & { completedOrders: number; lastStockUpdate: string | null }; stock: StockLine[] };

/** Pharmacy details, location, contact and full stock list with prices. */
export default function PharmacyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { q, coords, cart, addToCart, setQty, patient } = useSession();
  const [filter, setFilter] = useState('');
  const [fav, setFav] = useState(false);
  const [viewing, setViewing] = useState<{ id: number; title: string } | null>(null);
  const { data, loading, error } = useApi<Resp>(`/pharmacies/${id}?${q}`, [id, q]);

  useEffect(() => {
    if (!patient) return;
    api.get('/patient/favorites').then((r) => setFav(r.pharmacyIds.includes(Number(id)))).catch(() => {});
  }, [id, patient]);
  const toggleFav = async () => { setFav(!fav); try { fav ? await api.del(`/patient/favorites/${id}`) : await api.put(`/patient/favorites/${id}`); } catch { setFav(fav); } };

  if (loading && !data) return <SafeAreaView style={s.screen}><Header title="Pharmacy" /><Loading /></SafeAreaView>;
  if (error || !data) return <SafeAreaView style={s.screen}><Header title="Pharmacy" /><View style={s.pad}><ErrorBox text={error || 'Not found'} /></View></SafeAreaView>;
  const p = data.pharmacy;
  const stock = data.stock.filter((x) => !filter || x.medicine.name.toLowerCase().includes(filter.toLowerCase()));
  const inCart = (mid: number) => (cart?.pharmacy.id === p.id ? cart.items.find((i) => i.medicineId === mid)?.quantity ?? 0 : 0);
  const cartCount = cart?.pharmacy.id === p.id ? cart.items.reduce((n, i) => n + i.quantity, 0) : 0;

  const directions = () => {
    const dest = `${p.lat},${p.lng}`;
    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${dest}`,
      android: `google.navigation:q=${dest}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${dest}`,
    })!;
    Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}`));
  };
  const add = (line: StockLine) => {
    const go = () => addToCart(p, { medicineId: line.medicine.id, name: line.medicine.name, strength: line.medicine.strength, price: line.price, imageId: line.imageId });
    if (cart && cart.pharmacy.id !== p.id) confirmBox('Start a new cart?', `Your cart has items from ${cart.pharmacy.name}. Orders are placed with one pharmacy at a time.`, go);
    else go();
  };

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <Header title={p.name} subtitle={[p.area, p.city].filter(Boolean).join(', ')}
        right={<Pressable onPress={toggleFav} style={s.iconBtn} accessibilityLabel="Save pharmacy"><Ionicons name={fav ? 'heart' : 'heart-outline'} size={22} color={fav ? colors.red : colors.green} /></Pressable>} />
      <ScrollView contentContainerStyle={[s.pad, { paddingBottom: cartCount ? 110 : 40 }]}>
        {p.lat && p.lng && <PharmacyMap pins={[{ id: p.id, lat: p.lat, lng: p.lng, title: p.name }]} me={coords.source !== 'default' ? coords : null} height={180} />}
        <Card style={{ gap: 12 }}>
          <View style={s.rowBetween}>
            <ProfilePic imageId={p.logoImageId} label={p.name} size={60} round={false} icon="storefront" />
            <Text style={[s.h2, { flex: 1 }]}>{p.name}</Text>
            {p.distanceKm !== null && <Badge label={km(p.distanceKm)} tone="green" />}
          </View>
          {p.bio && <Text style={s.body}>{p.bio}</Text>}
          <Info icon="location-outline" text={`${p.address}${p.area ? `, ${p.area}` : ''}, ${p.city}`} />
          {p.openingHours && <Info icon="time-outline" text={p.openingHours} />}
          <Info icon="call-outline" text={p.phone} />
          <Info icon={p.offersDelivery ? 'bicycle-outline' : 'storefront-outline'} text={p.offersDelivery ? `Delivers · fee ${money(p.deliveryFee)}` : 'Pickup only'} />
          <Info icon="refresh-outline" text={`Stock updated ${timeAgo(p.lastStockUpdate) || 'recently'} · ${p.completedOrders} orders completed`} />
          <View style={[s.row, { flexWrap: 'wrap' }]}>
            <Button title="Call" icon="call" small variant="secondary" onPress={() => Linking.openURL(`tel:${p.phone}`)} style={{ flex: 1 }} />
            {p.whatsapp && <Button title="WhatsApp" icon="logo-whatsapp" small variant="secondary" onPress={() => Linking.openURL(`https://wa.me/${p.whatsapp!.replace(/\D/g, '')}`)} style={{ flex: 1 }} />}
            {p.lat && <Button title="Directions" icon="navigate" small onPress={directions} style={{ flex: 1 }} />}
          </View>
        </Card>

        <View style={s.rowBetween}><Text style={s.h3}>Medicines & prices</Text><Text style={s.muted}>{data.stock.filter((x) => x.stock !== 'Out of stock').length} in stock</Text></View>
        <View style={[s.inputWrap, { backgroundColor: '#fff' }]}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput value={filter} onChangeText={setFilter} placeholder={`Search ${p.name}`} placeholderTextColor="#94a39b" style={s.input} />
        </View>
        <Card style={{ paddingVertical: 4 }}>
          {stock.length === 0 && <Text style={[s.muted, { padding: 12 }]}>No matching medicines.</Text>}
          {stock.map((line, i) => {
            const out = line.stock === 'Out of stock';
            const qty = inCart(line.medicine.id);
            return (
              <View key={line.inventoryId} style={[s.row, { paddingVertical: 12 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }, out && { opacity: 0.55 }]}>
                <Pressable disabled={!line.imageId} onPress={() => line.imageId && setViewing({ id: line.imageId, title: `${line.medicine.name} ${line.medicine.strength}` })}>
                  <MedicineIcon name={line.medicine.name} imageId={line.imageId} size={52} />
                </Pressable>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={s.h3}>{line.medicine.name} <Text style={s.muted}>{line.medicine.strength}</Text></Text>
                  <View style={s.row}><Text style={{ fontWeight: '800', color: colors.green }}>{money(line.price)}</Text><Badge label={line.stock} /></View>
                </View>
                {!out && (qty ? (
                  <View style={[s.row, { gap: 6 }]}>
                    <Pressable onPress={() => setQty(line.medicine.id, qty - 1)} style={stepper}><Ionicons name="remove" size={18} color={colors.green} /></Pressable>
                    <Text style={{ fontWeight: '700', minWidth: 18, textAlign: 'center' }}>{qty}</Text>
                    <Pressable onPress={() => setQty(line.medicine.id, qty + 1)} style={stepper}><Ionicons name="add" size={18} color={colors.green} /></Pressable>
                  </View>
                ) : <Button title="Add" small icon="add" onPress={() => add(line)} />)}
              </View>
            );
          })}
        </Card>
        <Pressable onPress={() => router.push({ pathname: '/report', params: { pharmacyId: String(p.id), pharmacyName: p.name } })}>
          <Text style={[s.muted, { textAlign: 'center' }]}><Ionicons name="flag-outline" size={13} /> Wrong stock or price? Report it</Text>
        </Pressable>
      </ScrollView>
      <PhotoViewer imageId={viewing?.id ?? null} title={viewing?.title} onClose={() => setViewing(null)} />
      {cartCount > 0 && (
        <View style={{ position: 'absolute', left: 18, right: 18, bottom: 24 }}>
          <Button title={`View cart · ${cartCount} item${cartCount > 1 ? 's' : ''} · ${money(cart!.items.reduce((t, i) => t + i.price * i.quantity, 0))}`} icon="cart" onPress={() => router.push('/checkout')} />
        </View>
      )}
    </SafeAreaView>
  );
}

const stepper = { width: 32, height: 32, borderRadius: 9, borderWidth: 1, borderColor: colors.line, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: '#fff' };

function Info({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return <View style={[s.row, { alignItems: 'flex-start' }]}><Ionicons name={icon} size={18} color={colors.green3} style={{ marginTop: 1 }} /><Text style={[s.body, { flex: 1, fontSize: 14 }]}>{text}</Text></View>;
}
