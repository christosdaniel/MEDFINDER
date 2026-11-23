import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, ErrorBox, Header, Input, s } from '../../components/ui';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { colors } from '../../lib/theme';

export default function Forgot() {
  const params = useLocalSearchParams<{ phone?: string }>();
  const router = useRouter();
  const { signIn } = useSession();
  const [phone, setPhone] = useState(params.phone || '');
  const [sent, setSent] = useState(false);
  const [dev, setDev] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true); setError('');
    try { const r = await api.post('/patient/auth/forgot-password', { phone }); setSent(true); setDev(r.devOtp || ''); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const reset = async () => {
    setBusy(true); setError('');
    try { const r = await api.post('/patient/auth/reset-password', { phone, code, password }); await signIn(r.token, r.patient); router.replace('/(tabs)'); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: '#fff' }]}>
      <Header title="Reset password" />
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        {!!error && <ErrorBox text={error} />}
        <Input label="Phone number" icon="call-outline" value={phone} onChangeText={setPhone} keyboardType="phone-pad" editable={!sent} />
        {!sent ? <Button title="Send reset code" onPress={send} loading={busy} disabled={!phone} /> : (
          <View style={{ gap: 16 }}>
            {!!dev && <Text style={{ color: colors.amberText, backgroundColor: colors.amber, padding: 10, borderRadius: 10 }}>Development mode: code {dev}</Text>}
            <Input label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
            <Input label="New password" value={password} onChangeText={setPassword} secureTextEntry hint="At least 6 characters" />
            <Button title="Reset and log in" onPress={reset} loading={busy} disabled={code.length !== 6 || password.length < 6} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
