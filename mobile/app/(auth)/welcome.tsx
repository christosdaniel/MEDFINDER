import { Image, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Button, s } from '../../components/ui';
import { colors } from '../../lib/theme';

const POINTS: [keyof typeof Ionicons.glyphMap, string, string][] = [
  ['search', 'Search any medicine', 'See which pharmacies have it in stock right now'],
  ['pricetags-outline', 'Compare prices', 'Find the best price and the nearest pharmacy'],
  ['bicycle-outline', 'Pickup or delivery', 'Order ahead and collect, or get it delivered'],
];

export default function Welcome() {
  const router = useRouter();
  return (
    <SafeAreaView style={[s.screen, { backgroundColor: '#fff' }]}>
      <View style={{ flex: 1, padding: 24, justifyContent: 'space-between' }}>
        <View style={{ alignItems: 'center', marginTop: 30 }}>
          <Image source={require('../../assets/logo.png')} style={{ width: 300, height: 100 }} resizeMode="contain" />
        </View>
        <View style={{ gap: 22 }}>
          <Text style={[s.h1, { fontSize: 30 }]}>Find your medicine fast</Text>
          {POINTS.map(([icon, t, d]) => (
            <View key={t} style={s.row}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={icon} size={22} color={colors.green3} />
              </View>
              <View style={{ flex: 1 }}><Text style={s.h3}>{t}</Text><Text style={s.muted}>{d}</Text></View>
            </View>
          ))}
        </View>
        <View style={{ gap: 10 }}>
          <Button title="Create an account" onPress={() => router.push('/(auth)/register')} />
          <Button title="I already have an account" variant="secondary" onPress={() => router.push('/(auth)/login')} />
        </View>
      </View>
    </SafeAreaView>
  );
}
