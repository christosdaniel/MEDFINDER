import { Redirect, Stack } from 'expo-router';
import { useSession } from '../../lib/session';

export default function AuthLayout() {
  const { patient, ready } = useSession();
  if (ready && patient) return <Redirect href="/(tabs)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
