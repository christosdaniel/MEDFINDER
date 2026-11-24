import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Badge, Card, s } from './ui';
import type { PharmacySummary } from '../lib/api';
import { colors, km } from '../lib/theme';

export default function PharmacyRow({ p }: { p: PharmacySummary }) {
  const router = useRouter();
  return (
    <Card onPress={() => router.push(`/pharmacy/${p.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="storefront" size={22} color={colors.green3} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.h3} numberOfLines={1}>{p.name}</Text>
        <Text style={s.muted} numberOfLines={1}>{[p.area, p.city].filter(Boolean).join(', ')}{p.distanceKm !== null ? ` · ${km(p.distanceKm)}` : ''}</Text>
        <View style={[s.row, { gap: 6, marginTop: 2 }]}>
          {p.offersDelivery ? <Badge label="Delivery" tone="blue" /> : <Badge label="Pickup only" tone="grey" />}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Card>
  );
}
