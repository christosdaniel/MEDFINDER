import { Redirect } from 'expo-router';
import { Image, View } from 'react-native';
import { useSession } from '../lib/session';

/** Decide where to start: remembered patients go straight to Home. */
export default function Index() {
  const { ready, patient } = useSession();
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
        <Image source={require('../assets/logo.png')} style={{ width: 260, height: 87 }} resizeMode="contain" />
      </View>
    );
  }
  return <Redirect href={patient ? '/(tabs)' : '/(auth)/welcome'} />;
}
