import { Alert, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Avatar, Card, s } from '../../components/ui';
import { useSession } from '../../lib/session';
import { colors } from '../../lib/theme';

export default function Profile() {
  const router = useRouter();
  const { patient, signOut, supportPhone } = useSession();
  if (!patient) return null;

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
          <Avatar letter={patient.firstName[0]} size={58} />
          <View style={{ flex: 1 }}>
            <Text style={s.h2}>{patient.firstName} {patient.lastName}</Text>
            <Text style={s.muted}>{patient.phone}</Text>
            {patient.email && <Text style={s.muted}>{patient.email}</Text>}
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
