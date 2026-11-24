import { useEffect } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card, Empty, Header, Loading, s } from '../components/ui';
import { api } from '../lib/api';
import { useApi } from '../lib/session';
import { colors, timeAgo } from '../lib/theme';

type N = { id: number; type: string; title: string; body: string; read: boolean; createdAt: string; data: any };
type A = { id: number; medicineId: number; name: string; strength: string; notifiedAt: string | null };

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = { order: 'bag-handle-outline', restock: 'medkit-outline', welcome: 'happy-outline', complaint: 'flag-outline' };

export default function Notifications() {
  const router = useRouter();
  const { data, loading } = useApi<{ notifications: N[] }>('/patient/notifications');
  const alerts = useApi<{ alerts: A[] }>('/patient/restock-alerts');
  useEffect(() => { api.post('/patient/notifications/read').catch(() => {}); }, []);

  const open = (n: N) => {
    if (n.data?.orderId) router.push(`/order/${n.data.orderId}`);
    else if (n.data?.medicineId) router.push(`/medicine/${n.data.medicineId}`);
  };
  const removeAlert = async (a: A) => { await api.del(`/patient/restock-alerts/${a.id}`).catch(() => {}); alerts.reload(); };
  const waiting = alerts.data?.alerts.filter((a) => !a.notifiedAt) || [];

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title="Notifications" />
      <ScrollView contentContainerStyle={s.pad}>
        {waiting.length > 0 && (
          <View style={{ gap: 10 }}>
            <Text style={s.h3}>Waiting for restock</Text>
            {waiting.map((a) => (
              <Card key={a.id} style={s.row}>
                <Ionicons name="notifications-outline" size={20} color={colors.amberText} />
                <Text style={[s.body, { flex: 1 }]}>{a.name} {a.strength}</Text>
                <Pressable onPress={() => removeAlert(a)}><Text style={{ color: colors.red, fontWeight: '600' }}>Remove</Text></Pressable>
              </Card>
            ))}
          </View>
        )}
        {loading && !data ? <Loading /> : !data?.notifications.length ? <Empty icon="notifications-outline" title="No notifications yet" text="Order updates and restock alerts will appear here." /> : (
          <Card style={{ paddingVertical: 4 }}>
            {data.notifications.map((n, i) => (
              <Pressable key={n.id} onPress={() => open(n)} style={[s.row, { paddingVertical: 14, alignItems: 'flex-start' }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: n.read ? colors.tint2 : colors.tint, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={ICON[n.type] || 'information-circle-outline'} size={20} color={colors.green3} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[s.h3, { fontSize: 15 }]}>{n.title}</Text>
                  <Text style={s.muted}>{n.body}</Text>
                  <Text style={[s.muted, { fontSize: 11 }]}>{timeAgo(n.createdAt)}</Text>
                </View>
                {!n.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green2, marginTop: 6 }} />}
              </Pressable>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
