import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card, s } from '../../components/ui';
import { ProfilePic, pickPhoto } from '../../components/Photo';
import { api } from '../../lib/api';
import { show } from '../../lib/dialog';
import { useSession } from '../../lib/session';
import { colors } from '../../lib/theme';

export default function Profile() {
  const router = useRouter();
  const { patient, setPatient, signOut, supportPhone } = useSession();
  const [uploading, setUploading] = useState(false);
  if (!patient) return null;

  const upload = async (source: 'library' | 'camera') => {
    const asset = await pickPhoto(source);
    if (!asset) return;
    setUploading(true);
    try { const r = await api.upload('/patient/me/avatar', asset); setPatient(r.patient); }
    catch (e: any) { show('Could not upload photo', e.message); } finally { setUploading(false); }
  };
  const removePhoto = async () => { try { const r = await api.del('/patient/me/avatar'); setPatient(r.patient); } catch (e: any) { show('Could not remove photo', e.message); } };
  const changePhoto = () => {
    if (Platform.OS === 'web') { upload('library'); return; }
    Alert.alert('Profile picture', undefined, [
      { text: 'Take a photo', onPress: () => upload('camera') },
      { text: 'Choose from photos', onPress: () => upload('library') },
      ...(patient.avatarImageId ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: removePhoto }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const confirmSignOut = () => {
    if (Platform.OS === 'web') { signOut(); return; }
    Alert.alert('Sign out?', 'You will need your phone number and password to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  const items: [keyof typeof Ionicons.glyphMap, string, () => void][] = [
    ['person-outline', 'Edit profile & address', () => router.push('/edit-profile')],
    ['bag-handle-outline', 'My orders', () => router.push('/(tabs)/orders')],
    ['notifications-outline', 'Notifications & restock alerts', () => router.push('/notifications')],
    ['flag-outline', 'Report a problem with a pharmacy', () => router.push('/report')],
    ['call-outline', 'Contact MedFinder support', () => supportPhone && Linking.openURL(`tel:${supportPhone.replace(/\s/g, '')}`)],
  ];

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={s.pad}>
        <Text style={s.h1}>Profile</Text>
        <Card style={[s.row, { gap: 14 }]}>
          <Pressable onPress={changePhoto} accessibilityLabel="Change profile picture">
            <ProfilePic imageId={patient.avatarImageId} label={patient.firstName} size={66} />
            <View style={{ position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.green, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
              {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={13} color="#fff" />}
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.h2}>{patient.firstName} {patient.lastName}</Text>
            <Text style={s.muted}>{patient.phone}</Text>
            {patient.email && <Text style={s.muted}>{patient.email}</Text>}
            <Pressable onPress={changePhoto}><Text style={{ color: colors.green3, fontWeight: '600', marginTop: 4 }}>{patient.avatarImageId ? 'Change photo' : 'Add a profile photo'}</Text></Pressable>
          </View>
        </Card>
        <Card style={{ paddingVertical: 4 }}>
          {items.map(([icon, label, onPress], i) => (
            <Pressable key={label} onPress={onPress} style={[s.row, { paddingVertical: 15 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
              <Ionicons name={icon} size={20} color={colors.green3} />
              <Text style={[s.body, { flex: 1 }]}>{label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ))}
        </Card>
        <Pressable onPress={confirmSignOut} style={[s.card, s.row, { justifyContent: 'center' }]}>
          <Ionicons name="log-out-outline" size={20} color={colors.red} />
          <Text style={{ color: colors.red, fontWeight: '700' }}>Sign out</Text>
        </Pressable>
        <Text style={[s.muted, { textAlign: 'center', fontSize: 12 }]}>MedFinder Ghana · v1.0.0{'\n'}Find medicine, save time and stay healthy.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
