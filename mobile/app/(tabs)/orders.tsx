import { useCallback } from 'react';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Badge, Button, Card, Empty, ErrorBox, Loading, s } from '../../components/ui';
import type { Order } from '../../lib/api';
import { useApi } from '../../lib/session';
import { colors, money, timeAgo } from '../../lib/theme';

const ACTIVE = ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery'];

export default function Orders() {
  const router = useRouter();
  const { data, loading, error, reload } = useApi<{ orders: Order[] }>('/patient/orders');
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  const orders = data?.orders || [];
  const active = orders.filter((o) => ACTIVE.includes(o.status));
  const past = orders.filter((o) => !ACTIVE.includes(o.status));
  const rows: (Order | string)[] = [...(active.length ? ['In progress', ...active] : []), ...(past.length ? ['Past orders', ...past] : [])];

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <FlatList
        data={rows}
        keyExtractor={(r) => (typeof r === 'string' ? r : String(r.id))}
        onRefresh={reload}
        refreshing={loading && !!data}
        contentContainerStyle={{ padding: 18, gap: 10, paddingBottom: 40 }}
        ListHeaderComponent={<View style={{ gap: 12, marginBottom: 4 }}><Text style={s.h1}>My orders</Text>{error && <ErrorBox text={error} />}</View>}
        ListEmptyComponent={loading ? <Loading /> : <Empty icon="bag-handle-outline" title="No orders yet" text="Search for a medicine and order from a pharmacy near you." action={<Button title="Find medicine" icon="search" onPress={() => router.push('/(tabs)/search')} style={{ marginTop: 8 }} />} />}
        renderItem={({ item }) => typeof item === 'string' ? <Text style={[s.h3, { marginTop: 8 }]}>{item}</Text> : (
          <Card onPress={() => router.push(`/order/${item.id}`)} style={{ gap: 10 }}>
            <View style={s.rowBetween}>
              <Text style={s.h3}>{item.pharmacy.name}</Text>
              <Badge label={item.statusText} tone={item.status === 'completed' ? 'green' : ['cancelled', 'rejected'].includes(item.status) ? 'red' : item.status === 'pending' ? 'amber' : 'blue'} />
            </View>
            <Text style={s.muted} numberOfLines={2}>{item.items.map((i) => `${i.name} ${i.strength} ×${i.quantity}`).join(', ')}</Text>
            <View style={s.rowBetween}>
              <View style={s.row}><Ionicons name={item.method === 'delivery' ? 'bicycle-outline' : 'storefront-outline'} size={16} color={colors.muted} /><Text style={s.muted}>{item.method === 'delivery' ? 'Delivery' : 'Pickup'} · {item.code} · {timeAgo(item.createdAt)}</Text></View>
              <Text style={{ fontWeight: '800', color: colors.green }}>{money(item.total)}</Text>
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}
