import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, ErrorBox, Header, s } from '../../components/ui';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { colors } from '../../lib/theme';

export default function Verify() {
  const { phone, devOtp } = useLocalSearchParams<{ phone: string; devOtp?: string }>();
  const router = useRouter();
  const { signIn } = useSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(30);
  const [hint, setHint] = useState(devOtp || '');
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => { const t = setInterval(() => setWait((w) => (w > 0 ? w - 1 : 0)), 1000); return () => clearInterval(t); }, []);

  const submit = async (c = code) => {
    setBusy(true); setError('');
    try {
      const r = await api.post('/patient/auth/verify-otp', { phone, code: c });
      await signIn(r.token, r.patient);
      router.replace('/(tabs)');
    } catch (e: any) { setError(e.message); setCode(''); } finally { setBusy(false); }
  };
  const resend = async () => {
    try { const r = await api.post('/patient/auth/resend-otp', { phone }); setWait(30); setHint(r.devOtp || ''); } catch (e: any) { setError(e.message); }
  };

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: '#fff' }]}>
      <Header title="" />
      <View style={s.pad}>
        <View style={{ gap: 6 }}>
          <Text style={s.h1}>Enter verification code</Text>
          <Text style={s.muted}>We sent a 6-digit code to {phone}.</Text>
        </View>
        {!!error && <ErrorBox text={error} />}
        <Pressable onPress={() => input.current?.focus()} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={{ width: 48, height: 58, borderRadius: 12, borderWidth: 1.5, borderColor: code.length === i ? colors.green2 : colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tint2 }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>{code[i] || ''}</Text>
            </View>
          ))}
        </Pressable>
        <TextInput
          ref={input}
          value={code}
          onChangeText={(t) => { const c = t.replace(/\D/g, '').slice(0, 6); setCode(c); if (c.length === 6) submit(c); }}
          keyboardType="number-pad"
          autoFocus
          maxLength={6}
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
        />
        {!!hint && (
          <View style={{ backgroundColor: colors.amber, padding: 10, borderRadius: 10 }}>
            <Text style={{ color: colors.amberText, fontSize: 13 }}>Development mode: your code is <Text style={{ fontWeight: '800' }}>{hint}</Text></Text>
          </View>
        )}
        <Button title="Verify" onPress={() => submit()} loading={busy} disabled={code.length !== 6} />
        <Pressable onPress={resend} disabled={wait > 0}>
          <Text style={[s.muted, { textAlign: 'center' }]}>{wait > 0 ? `Resend code in ${wait}s` : <Text style={{ color: colors.green3, fontWeight: '700' }}>Resend code</Text>}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
