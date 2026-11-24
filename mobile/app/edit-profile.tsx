import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, ErrorBox, Header, Input, s } from '../components/ui';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { colors } from '../lib/theme';
import { confirmBox, show } from '../lib/dialog';

export default function EditProfile() {
  const router = useRouter();
  const { patient, setPatient, signOut } = useSession();
  const [f, setF] = useState({
    firstName: patient?.firstName || '', lastName: patient?.lastName || '', email: patient?.email || '',
    age: patient?.age ? String(patient.age) : '', address: patient?.address || '',
  });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  const save = async () => {
    setBusy(true); setError('');
    try {
      const r = await api.patch('/patient/me', { ...f, email: f.email || undefined, age: f.age || undefined, address: f.address || undefined });
      setPatient(r.patient);
      router.back();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const changePw = async () => {
    try { await api.post('/patient/me/password', pw); setPw({ currentPassword: '', newPassword: '' }); show('Done', 'Your password was changed.'); }
    catch (e: any) { show('Could not change password', e.message); }
  };
  const deleteAccount = () => confirmBox('Delete your account?', 'Your personal details will be removed. This cannot be undone.', async () => {
    if (!pw.currentPassword) { show('Enter your password', 'Type your current password in the password section first.'); return; }
    try { await api.del('/patient/me', { password: pw.currentPassword }); await signOut(); }
    catch (e: any) { show('Could not delete account', e.message); }
  });

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <Header title="Edit profile" />
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        {!!error && <ErrorBox text={error} />}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Input label="First name" value={f.firstName} onChangeText={set('firstName')} /></View>
          <View style={{ flex: 1 }}><Input label="Last name" value={f.lastName} onChangeText={set('lastName')} /></View>
        </View>
        <Input label="Phone" value={patient?.phone} editable={false} hint="Contact support to change your phone number" />
        <Input label="Email" value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
        <Input label="Age" value={f.age} onChangeText={set('age')} keyboardType="number-pad" />
        <Input label="Default delivery address" value={f.address} onChangeText={set('address')} multiline placeholder="House number, street, landmark" />
        <Button title="Save" onPress={save} loading={busy} />

        <View style={[s.divider, { marginVertical: 6 }]} />
        <Text style={s.h3}>Change password</Text>
        <Input label="Current password" value={pw.currentPassword} onChangeText={(v) => setPw({ ...pw, currentPassword: v })} secureTextEntry />
        <Input label="New password" value={pw.newPassword} onChangeText={(v) => setPw({ ...pw, newPassword: v })} secureTextEntry hint="At least 6 characters" />
        <Button title="Update password" variant="secondary" onPress={changePw} disabled={!pw.currentPassword || pw.newPassword.length < 6} />
        <Button title="Delete my account" variant="ghost" onPress={deleteAccount} style={{ marginTop: 10 }} />
        <Text style={[s.muted, { textAlign: 'center', color: colors.muted, fontSize: 12 }]}>Deleting needs your current password above.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
