import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, ErrorBox, Header, Input, s } from '../../components/ui';
import { api } from '../../lib/api';
import { colors } from '../../lib/theme';

export default function Register() {
  const router = useRouter();
  const [f, setF] = useState({ firstName: '', lastName: '', phone: '', email: '', age: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  const submit = async () => {
    if (f.password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setBusy(true); setError('');
    try {
      const r = await api.post('/patient/auth/register', { ...f, email: f.email || undefined, age: f.age || undefined });
      router.push({ pathname: '/(auth)/verify', params: { phone: r.phone, devOtp: r.devOtp ?? '' } });
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: '#fff' }]} edges={['top', 'bottom']}>
      <Header title="" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[s.pad, { paddingTop: 8 }]} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 6 }}>
            <Text style={s.h1}>Create your account</Text>
            <Text style={s.muted}>We'll text you a code to confirm your number.</Text>
          </View>
          {!!error && <ErrorBox text={error} />}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><Input label="First name" value={f.firstName} onChangeText={set('firstName')} autoComplete="given-name" /></View>
            <View style={{ flex: 1 }}><Input label="Last name" value={f.lastName} onChangeText={set('lastName')} autoComplete="family-name" /></View>
          </View>
          <Input label="Phone number" icon="call-outline" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="024 123 4567" autoComplete="tel" />
          <Input label="Email (optional)" icon="mail-outline" value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
          <Input label="Age (optional)" value={f.age} onChangeText={set('age')} keyboardType="number-pad" />
          <Input label="Password" icon="lock-closed-outline" value={f.password} onChangeText={set('password')} secureTextEntry hint="At least 6 characters" autoComplete="new-password" />
          <Button title="Continue" onPress={submit} loading={busy} disabled={!f.firstName || !f.lastName || !f.phone || !f.password} />
          <Text style={[s.muted, { textAlign: 'center', fontSize: 12 }]}>By continuing you agree to MedFinder's terms and privacy policy.</Text>
          <Pressable onPress={() => router.replace('/(auth)/login')}>
            <Text style={[s.muted, { textAlign: 'center' }]}>Already have an account? <Text style={{ color: colors.green3, fontWeight: '700' }}>Log in</Text></Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
