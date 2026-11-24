import { useEffect } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, Card, ErrorBox, Header, Loading, s } from '../../components/ui';
import { api, type Order } from '../../lib/api';
import { useApi } from '../../lib/session';
import { colors, fmtDateTime, money } from '../../lib/theme';
import { confirmBox, show } from '../../lib/dialog';

const PICKUP = ['pending', 'accepted', 'preparing', 'ready', 'completed'];
const DELIVERY = ['pending', 'accepted', 'preparing', 'out_for_delivery', 'completed'];
const LABEL: Record<string, string> = { pending: 'Order placed', accepted: 'Accepted', preparing: 'Preparing', ready: 'Ready for pickup', out_for_delivery: 'On the way', completed: 'Completed' };

/** Track an order (refreshes automatically while it's in progress). */
export default function OrderScreen() {
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  const router = useRouter();
  const { data, loading, error, reload, setData } = useApi<{ order: Order }>(`/patient/orders/${id}`, [id]);
  const o = data?.order;
  const live = o && !['completed', 'cancelled', 'rejected'].includes(o.status);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(reload, 15000);
    return () => clearInterval(t);
  }, [live, reload]);

  const cancel = () => confirmBox('Cancel this order?', 'The pharmacy will be told you no longer need it.', async () => {
    try { const r = await api.post(`/patient/orders/${id}/cancel`); setData(r); } catch (e: any) { show('Could not cancel', e.message); }
  });

  if (loading && !o) return <SafeAreaView style={s.screen}><Header title="Order" /><Loading /></SafeAreaView>;
  if (error || !o) return <SafeAreaView style={s.screen}><Header title="Order" /><View style={s.pad}><ErrorBox text={error || 'Not found'} /></View></SafeAreaView>;

  const steps = o.method === 'delivery' ? DELIVERY : PICKUP;
  const failed = ['cancelled', 'rejected'].includes(o.status);
  const current = steps.indexOf(o.status);

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title={`Order ${o.code}`} subtitle={fmtDateTime(o.createdAt)} back={!placed} right={placed ? <Button title="Done" variant="ghost" small onPress={() => router.replace('/(tabs)')} /> : undefined} />
      <ScrollView contentContainerStyle={[s.pad, { paddingBottom: 40 }]}>
        {placed && o.status === 'pending' && (
          <View style={{ alignItems: 'center', gap: 8, paddingVertical: 10 }}>
            <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="checkmark" size={40} color={colors.green2} /></View>
            <Text style={s.h1}>Order placed!</Text>
            <Text style={[s.muted, { textAlign: 'center' }]}>{o.pharmacy.name} has received your order and will confirm it shortly.</Text>
          </View>
        )}

        <Card style={{ gap: 14 }}>
          <View style={s.rowBetween}><Text style={s.h3}>Status</Text><Badge label={o.statusText} tone={failed ? 'red' : o.status === 'completed' ? 'green' : 'blue'} /></View>
          {failed ? (
            <View style={{ gap: 6 }}>
              <Text style={s.body}>{o.status === 'rejected' ? 'The pharmacy could not fill this order.' : 'This order was cancelled.'}</Text>
              {o.pharmacyNote && <Text style={s.muted}>Pharmacy note: {o.pharmacyNote}</Text>}
              <Button title="Find another pharmacy" variant="secondary" icon="search" onPress={() => router.push(`/medicine/${o.items[0].medicineId}`)} />
            </View>
          ) : steps.map((st, i) => {
            const done = i <= current;
            const ev = o.timeline.find((t) => t.status === st);
            return (
              <View key={st} style={[s.row, { alignItems: 'flex-start' }]}>
                <View style={{ alignItems: 'center' }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: done ? colors.green2 : '#fff', borderWidth: 2, borderColor: done ? colors.green2 : colors.line, alignItems: 'center', justifyContent: 'center' }}>
                    {done && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  {i < steps.length - 1 && <View style={{ width: 2, height: 26, backgroundColor: i < current ? colors.green2 : colors.line }} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.h3, !done && { color: colors.muted, fontWeight: '500' }]}>{LABEL[st]}</Text>
                  {ev && <Text style={s.muted}>{fmtDateTime(ev.at)}{ev.note && ev.note !== LABEL[st] ? ` · ${ev.note}` : ''}</Text>}
                </View>
              </View>
            );
          })}
          {live && <Text style={[s.muted, { fontSize: 12 }]}>This page updates automatically.</Text>}
        </Card>

        <Card style={{ gap: 10 }}>
          <Text style={s.h3}>{o.pharmacy.name}</Text>
          <Text style={s.muted}>{o.pharmacy.address}{o.pharmacy.area ? `, ${o.pharmacy.area}` : ''}</Text>
          <View style={s.row}>
            <Button title="Call pharmacy" icon="call" small variant="secondary" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${o.pharmacy.phone}`)} />
            {o.pharmacy.lat && <Button title="Directions" icon="navigate" small style={{ flex: 1 }} onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${o.pharmacy.lat},${o.pharmacy.lng}`)} />}
          </View>
        </Card>

        <Card style={{ gap: 8 }}>
          <Text style={s.h3}>{o.method === 'delivery' ? 'Delivery to' : 'Pickup'}</Text>
          <Text style={s.muted}>{o.method === 'delivery' ? o.deliveryAddress : 'Collect at the pharmacy'} · {o.paymentMethod === 'momo' ? 'Mobile Money' : 'Cash'}</Text>
          <View style={s.divider} />
          {o.items.map((i) => (
            <View key={i.medicineId} style={s.rowBetween}><Text style={s.body}>{i.name} {i.strength} × {i.quantity}</Text><Text style={s.body}>{money(i.unitPrice * i.quantity)}</Text></View>
          ))}
          {o.deliveryFee > 0 && <View style={s.rowBetween}><Text style={s.muted}>Delivery fee</Text><Text style={s.body}>{money(o.deliveryFee)}</Text></View>}
          <View style={s.rowBetween}><Text style={s.h3}>Total</Text><Text style={[s.h3, { color: colors.green }]}>{money(o.total)}</Text></View>
        </Card>

        {o.canCancel && <Button title="Cancel order" variant="danger" icon="close" onPress={cancel} />}
        <Button title="Report a problem" variant="ghost" icon="flag-outline" onPress={() => router.push({ pathname: '/report', params: { pharmacyId: String(o.pharmacy.id), pharmacyName: o.pharmacy.name, orderId: String(o.id) } })} />
      </ScrollView>
    </SafeAreaView>
  );
}
