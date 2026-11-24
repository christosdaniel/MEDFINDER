import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Badge, Card, ErrorBox, Loading, Section, s } from '../../components/ui';
import MedicineIcon from '../../components/MedicineIcon';
import PharmacyRow from '../../components/PharmacyRow';
import { ProfilePic } from '../../components/Photo';
import { api, type MedicineSummary, type PharmacySummary, type StockLine } from '../../lib/api';
import { useApi, useSession } from '../../lib/session';
import { colors, km, money } from '../../lib/theme';

type Home = {
  nearbyPharmacies: PharmacySummary[];
  otherPharmacies: PharmacySummary[];
  popularMedicines: MedicineSummary[];
  offers: (StockLine & { pharmacy: PharmacySummary })[];
};

export default function HomeScreen() {
  const router = useRouter();
  const { patient, q, coords, announcements, cart, features } = useSession();
  const { data, loading, error, reload } = useApi<Home>(`/home?${q}`, [q]);
  const [unread, setUnread] = useState(0);

  const loadUnread = useCallback(() => { api.get('/patient/notifications').then((r) => setUnread(r.unread)).catch(() => {}); }, []);
  useFocusEffect(loadUnread);
  useEffect(() => { const t = setInterval(loadUnread, 30000); return () => clearInterval(t); }, [loadUnread]);

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={[s.pad, { paddingBottom: 40 }]} refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={colors.green} />}>
        <View style={s.rowBetween}>
          <Pressable onPress={() => router.push('/(tabs)/profile')}>
            <ProfilePic imageId={patient?.avatarImageId} label={patient?.firstName || '?'} size={48} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.muted}>{greet},</Text>
            <Text style={s.h1}>{patient?.firstName}</Text>
          </View>
          <Pressable onPress={() => router.push('/notifications')} style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Notifications">
            <Ionicons name="notifications-outline" size={22} color={colors.green} />
            {unread > 0 && <View style={{ position: 'absolute', top: 6, right: 6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{unread > 9 ? '9+' : unread}</Text></View>}
          </Pressable>
        </View>

        <Pressable onPress={() => router.push('/(tabs)/search')} style={[s.inputWrap, { paddingVertical: 14, backgroundColor: '#fff' }]}>
          <Ionicons name="search" size={20} color={colors.muted} />
          <Text style={{ color: '#94a39b', fontSize: 15, flex: 1 }}>Search medicine or pharmacy</Text>
        </Pressable>
        <View style={s.row}>
          <Ionicons name="location" size={14} color={colors.green3} />
          <Text style={s.muted}>{coords.source === 'gps' ? 'Showing pharmacies near your current location' : coords.source === 'profile' ? 'Near your saved location' : 'Turn on location to see pharmacies nearest you'}</Text>
        </View>

        {features.maintenance_mode && <ErrorBox text="MedFinder is under maintenance. Ordering is paused for a short while." />}
        {announcements.map((a) => (
          <View key={a.id} style={{ backgroundColor: colors.green, borderRadius: 16, padding: 16, gap: 4 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{a.title}</Text>
            <Text style={{ color: '#d6f0e0', fontSize: 13 }}>{a.body}</Text>
          </View>
        ))}

        {cart && (
          <Card onPress={() => router.push('/checkout')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.tint, borderColor: colors.green2 }}>
            <Ionicons name="cart" size={22} color={colors.green} />
            <View style={{ flex: 1 }}><Text style={s.h3}>Your cart · {cart.items.reduce((n, i) => n + i.quantity, 0)} items</Text><Text style={s.muted}>{cart.pharmacy.name}</Text></View>
            <Text style={{ color: colors.green, fontWeight: '700' }}>Checkout</Text>
          </Card>
        )}

        {error && <ErrorBox text={error} />}
        {loading && !data ? <Loading /> : data && (
          <>
            {data.offers.length > 0 && (
              <Section title="Medicines near you" action="Search" onAction={() => router.push('/(tabs)/search')}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 6 }}>
                  {data.offers.map((o) => (
                    <Card key={o.inventoryId} style={{ width: 170, gap: 8 }} onPress={() => router.push(`/medicine/${o.medicine.id}`)}>
                      <MedicineIcon name={o.medicine.name} imageId={o.imageId} size={64} />
                      <View><Text style={s.h3} numberOfLines={1}>{o.medicine.name}</Text><Text style={s.muted}>{o.medicine.strength}</Text></View>
                      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.green }}>{money(o.price)}</Text>
                      <View style={s.row}><Ionicons name="storefront-outline" size={13} color={colors.muted} /><Text style={[s.muted, { flex: 1, fontSize: 12 }]} numberOfLines={1}>{o.pharmacy.name}</Text></View>
                      <View style={s.rowBetween}><Badge label={o.stock} /><Text style={[s.muted, { fontSize: 12 }]}>{km(o.pharmacy.distanceKm)}</Text></View>
                    </Card>
                  ))}
                </ScrollView>
              </Section>
            )}

            <Section title="Pharmacies near you" action="See all" onAction={() => router.push('/(tabs)/pharmacies')}>
              {data.nearbyPharmacies.slice(0, 4).map((p) => <PharmacyRow key={p.id} p={p} />)}
            </Section>

            {data.popularMedicines.length > 0 && (
              <Section title="Popular medicines">
                <Card style={{ paddingVertical: 4 }}>
                  {data.popularMedicines.slice(0, 6).map((m, i) => (
                    <Pressable key={m.id} onPress={() => router.push(`/medicine/${m.id}`)} style={[s.row, { paddingVertical: 12 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                      <MedicineIcon name={m.name} imageId={m.imageId} size={44} />
                      <View style={{ flex: 1 }}><Text style={s.h3}>{m.name} <Text style={s.muted}>{m.strength}</Text></Text><Text style={s.muted}>{m.pharmacies ? `In stock at ${m.pharmacies} pharmacies` : 'Out of stock nearby'}</Text></View>
                      <View style={{ alignItems: 'flex-end' }}>{m.minPrice ? <><Text style={[s.muted, { fontSize: 11 }]}>from</Text><Text style={{ fontWeight: '800', color: colors.green }}>{money(m.minPrice)}</Text></> : <Badge label="Out of stock" />}</View>
                    </Pressable>
                  ))}
                </Card>
              </Section>
            )}

            {data.otherPharmacies.length > 0 && (
              <Section title="Other pharmacies on MedFinder">
                {data.otherPharmacies.slice(0, 6).map((p) => <PharmacyRow key={p.id} p={p} />)}
              </Section>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
