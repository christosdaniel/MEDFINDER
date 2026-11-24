import { Stack } from 'expo-router';
import { Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../lib/session';
import { colors } from '../lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        {/* On laptops/PCs (web) keep the app at a comfortable reading width. */}
        <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? '#e9f0ec' : colors.bg }}>
          <View style={{ flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 760 : undefined, alignSelf: 'center', backgroundColor: colors.bg }}>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
          </View>
        </View>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
