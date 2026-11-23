import { View, Text } from 'react-native';
import { colors } from '../lib/theme';

const PALETTE = [colors.green3, '#1d5fa5', '#8b5d0a', '#7a3fa0', '#b5452f', '#0f7a6e'];
export default function MedicineIcon({ name, size = 46 }: { name: string; size?: number }) {
  const i = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontWeight: '800', fontSize: size * 0.42, color: PALETTE[i] }}>{name[0]?.toUpperCase()}</Text>
    </View>
  );
}
