import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Badge, Chip, Empty, Loading, s } from '../../components/ui';
import MedicineIcon from '../../components/MedicineIcon';
import { api, type MedicineSummary, type PharmacySummary } from '../../lib/api';
import { useSession } from '../../lib/session';
import { colors, km, money } from '../../lib/theme';

export default function Search() {
  const router = useRouter();
  const { q: loc } = useSession();
  const [mode, setMode] = useState<'medicine' | 'pharmacy'>('medicine');
  const [text, setText] = useState('');
  const [meds, setMeds] = useState<MedicineSummary[]>([]);
  const [pharms, setPharms] = useState<PharmacySummary[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get('/patient/recent-searches').then((r) => setRecent(r.searches)).catch(() => {}); }, []);

  // Debounced search as the user types.
  useEffect(() => {
    const term = text.trim();
    if (term.length < 2) { setMeds([]); setPharms([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        if (mode === 'medicine') setMeds((await api.get(`/medicines/search?q=${encodeURIComponent(term)}&${loc}`)).results);
        else setPharms((await api.get(`/pharmacies?q=${encodeURIComponent(term)}&${loc}`)).pharmacies);
      } catch { /* ignore */ } finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [text, mode, loc]);

  const popular = ['Paracetamol', 'Coartem', 'Amoxicillin', 'ORS', 'Vitamin C', 'Ibuprofen'];
  const showSuggestions = text.trim().length < 2;

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={{ padding: 18, gap: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <Text style={s.h1}>Search</Text>
        <View style={[s.inputWrap, { backgroundColor: colors.tint2 }]}>
          <Ionicons name="search" size={20} color={colors.muted} />
          <TextInput autoFocus value={text} onChangeText={setText} placeholder={mode === 'medicine' ? 'e.g. Paracetamol, Coartem' : 'Pharmacy name or area'} placeholderTextColor="#94a39b" style={s.input} returnKeyType="search" autoCorrect={false} />
          {!!text && <Pressable onPress={() => setText('')}><Ionicons name="close-circle" size={20} color={colors.muted} /></Pressable>}
        </View>
        <View style={s.row}>
          <Chip label="Medicines" icon="medkit-outline" active={mode === 'medicine'} onPress={() => setMode('medicine')} />
          <Chip label="Pharmacies" icon="storefront-outline" active={mode === 'pharmacy'} onPress={() => setMode('pharmacy')} />
        </View>
      </View>

      {showSuggestions ? (
        <View style={s.pad}>
          {recent.length > 0 && (
            <View style={{ gap: 10 }}>
              <Text style={s.h3}>Recent searches</Text>
              <View style={[s.row, { flexWrap: 'wrap' }]}>{recent.map((r) => <Chip key={r} label={r} icon="time-outline" onPress={() => { setMode('medicine'); setText(r); }} />)}</View>
            </View>
          )}
          <View style={{ gap: 10 }}>
            <Text style={s.h3}>Popular searches</Text>
            <View style={[s.row, { flexWrap: 'wrap' }]}>{popular.map((r) => <Chip key={r} label={r} onPress={() => { setMode('medicine'); setText(r); }} />)}</View>
          </View>
        </View>
      ) : loading && !meds.length && !pharms.length ? <Loading /> : mode === 'medicine' ? (
        <FlatList
          data={meds}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: 18, gap: 10 }}
          ListEmptyComponent={<Empty icon="search" title="No medicines found" text="Check the spelling or try the generic name." />}
          renderItem={({ item: m }) => (
            <Pressable onPress={() => router.push(`/medicine/${m.id}`)} style={[s.card, s.row]}>
              <MedicineIcon name={m.name} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.h3}>{m.name} <Text style={s.muted}>{m.strength}</Text></Text>
                <Text style={s.muted}>{[m.form, m.category].filter(Boolean).join(' · ')}</Text>
                {m.requiresPrescription && <Badge label="Prescription needed" tone="blue" />}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                {m.pharmacies ? (<><Text style={{ fontWeight: '800', color: colors.green }}>{money(m.minPrice)}</Text><Text style={[s.muted, { fontSize: 12 }]}>{m.pharmacies} pharmac{m.pharmacies === 1 ? 'y' : 'ies'}</Text></>) : <Badge label="Out of stock" />}
              </View>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={pharms}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ padding: 18, gap: 10 }}
          ListEmptyComponent={<Empty icon="storefront-outline" title="No pharmacies found" />}
          renderItem={({ item: p }) => (
            <Pressable onPress={() => router.push(`/pharmacy/${p.id}`)} style={[s.card, s.row]}>
              <Ionicons name="storefront" size={24} color={colors.green3} />
              <View style={{ flex: 1 }}><Text style={s.h3}>{p.name}</Text><Text style={s.muted}>{[p.area, p.city].filter(Boolean).join(', ')}</Text></View>
              <Text style={s.muted}>{km(p.distanceKm)}</Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
