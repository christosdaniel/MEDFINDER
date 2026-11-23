import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, ErrorBox, Header, Input, s } from '../../components/ui';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { colors } from '../../lib/theme';

export default function Login() {
  const router = useRouter();
  const { signIn, lastPhone } = useSession();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Remember the phone number used last time so login is quick.
  useEffect(() => { if (lastPhone && !phone) setPhone(lastPhone.replace(/^\+233/, '0')); }, [lastPhone]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const r = await api.post('/patient/auth/login', { phone, password });
      if (r.needsVerification) {
        router.push({ pathname: '/(auth)/verify', params: { phone: r.phone, devOtp: r.devOtp ?? '' } });
      } else {
        await signIn(r.token, r.patient);
        router.replace('/(tabs)');
      }
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: '#fff' }]} edges={['top', 'bottom']}>
      <Header title="" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[s.pad, { paddingTop: 8 }]} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 6 }}>
            <Text style={s.h1}>Welcome back</Text>
            <Text style={s.muted}>Log in with your phone number.</Text>
          </View>
          {!!error && <ErrorBox text={error} />}
          <Input label="Phone number" icon="call-outline" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="024 123 4567" autoComplete="tel" textContentType="telephoneNumber" />
          <Input label="Password" icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry placeholder="Your password" autoComplete="password" textContentType="password" onSubmitEditing={submit} />
          <Pressable onPress={() => router.push({ pathname: '/(auth)/forgot', params: { phone } })}>
            <Text style={{ color: colors.green3, fontWeight: '600', textAlign: 'right' }}>Forgot password?</Text>
          </Pressable>
          <Button title="Log in" onPress={submit} loading={busy} disabled={!phone || !password} />
          <Pressable onPress={() => router.replace('/(auth)/register')}>
            <Text style={[s.muted, { textAlign: 'center' }]}>New here? <Text style={{ color: colors.green3, fontWeight: '700' }}>Create an account</Text></Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
