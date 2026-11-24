import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Chip, ErrorBox, Header, Input, s } from '../components/ui';
import { api, type PharmacySummary } from '../lib/api';
import { useApi, useSession } from '../lib/session';
import { show } from '../lib/dialog';

const SUBJECTS = ['Medicine listed but out of stock', 'Price was different', 'Order problem', 'Poor service', 'Other'];

/** Report a pharmacy to the MedFinder admin team. */
export default function Report() {
  const params = useLocalSearchParams<{ pharmacyId?: string; pharmacyName?: string; orderId?: string }>();
  const router = useRouter();
  const { q } = useSession();
  const [pharmacyId, setPharmacyId] = useState(params.pharmacyId ? Number(params.pharmacyId) : null);
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useApi<{ pharmacies: PharmacySummary[] }>(params.pharmacyId ? null : `/pharmacies?${q}`);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const r = await api.post('/patient/complaints', { pharmacyId, subject, details, orderId: params.orderId ? Number(params.orderId) : undefined });
      show('Report sent', r.message);
      router.back();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <Header title="Report a problem" subtitle={params.pharmacyName} />
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        {!params.pharmacyId && (
          <>
            <Text style={s.h3}>Which pharmacy?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {list.data?.pharmacies.map((p) => <Chip key={p.id} label={p.name} active={pharmacyId === p.id} onPress={() => setPharmacyId(p.id)} />)}
            </ScrollView>
          </>
        )}
        <Text style={s.h3}>What went wrong?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {SUBJECTS.map((x) => <Chip key={x} label={x} active={subject === x} onPress={() => setSubject(x)} />)}
        </ScrollView>
        <Input label="Details" value={details} onChangeText={setDetails} multiline numberOfLines={5} style={[s.input, { minHeight: 110, textAlignVertical: 'top' }]} placeholder="Tell us what happened (at least 10 characters)" />
        {!!error && <ErrorBox text={error} />}
        <Button title="Send report" onPress={submit} loading={busy} disabled={!pharmacyId || details.trim().length < 10} />
      </ScrollView>
    </SafeAreaView>
  );
}
