import { useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Chip, Empty, ErrorBox, Loading, s } from '../../components/ui';
import PharmacyRow from '../../components/PharmacyRow';
import PharmacyMap from '../../components/PharmacyMap';
import type { PharmacySummary } from '../../lib/api';
import { useApi, useSession } from '../../lib/session';
import { colors } from '../../lib/theme';

export default function Pharmacies() {
  const router = useRouter();
  const { q, coords, refreshLocation } = useSession();
  const [text, setText] = useState('');
  const [delivery, setDelivery] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const { data, loading, error, reload } = useApi<{ pharmacies: PharmacySummary[] }>(
    `/pharmacies?${q}&q=${encodeURIComponent(text)}${delivery ? '&delivery=true' : ''}`, [q, text, delivery]);
  const list = data?.pharmacies || [];
  const pins = list.filter((p) => p.lat && p.lng).slice(0, 25).map((p) => ({ id: p.id, lat: p.lat!, lng: p.lng!, title: p.name, subtitle: p.area || p.city }));

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <FlatList
        data={list}
        keyExtractor={(p) => String(p.id)}
        onRefresh={reload}
        refreshing={loading && !!data}
        contentContainerStyle={{ padding: 18, gap: 10, paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 6 }}>
            <View style={s.rowBetween}>
              <Text style={s.h1}>Pharmacies</Text>
              <Pressable onPress={refreshLocation} style={s.row}><Ionicons name="locate" size={18} color={colors.green3} /><Text style={{ color: colors.green3, fontWeight: '600' }}>Update location</Text></Pressable>
            </View>
            <View style={[s.inputWrap, { backgroundColor: '#fff' }]}>
              <Ionicons name="search" size={20} color={colors.muted} />
              <TextInput value={text} onChangeText={setText} placeholder="Search by name or area" placeholderTextColor="#94a39b" style={s.input} />
            </View>
            <View style={s.row}>
              <Chip label="Nearest first" active />
              <Chip label="Delivers" icon="bicycle-outline" active={delivery} onPress={() => setDelivery(!delivery)} />
              <Chip label={showMap ? 'Hide map' : 'Show map'} icon="map-outline" onPress={() => setShowMap(!showMap)} />
            </View>
            {showMap && pins.length > 0 && <PharmacyMap pins={pins} me={coords.source !== 'default' ? coords : null} height={230} onPressPin={(id) => router.push(`/pharmacy/${id}`)} />}
            {error && <ErrorBox text={error} />}
          </View>
        }
        ListEmptyComponent={loading ? <Loading /> : <Empty icon="storefront-outline" title="No pharmacies found" text="Try a different name or area." />}
        renderItem={({ item }) => <PharmacyRow p={item} />}
      />
    </SafeAreaView>
  );
}
