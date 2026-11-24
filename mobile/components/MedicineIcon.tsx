import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { imageUrl } from '../lib/api';
import { colors } from '../lib/theme';

const PALETTE = [colors.green3, '#1d5fa5', '#8b5d0a', '#7a3fa0', '#b5452f', '#0f7a6e'];

/** Medicine photo if the pharmacy (or MedFinder) added one, otherwise a coloured letter. */
export default function MedicineIcon({ name, size = 46, imageId }: { name: string; size?: number; imageId?: number | null }) {
  const [failed, setFailed] = useState(false);
  const uri = imageUrl(imageId);
  const box = { width: size, height: size, borderRadius: size * 0.3 };
  if (uri && !failed) {
    return <Image source={{ uri }} onError={() => setFailed(true)} style={[box, { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line }]} resizeMode="cover" accessibilityLabel={name} />;
  }
  const i = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length;
  return (
    <View style={[box, { backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ fontWeight: '800', fontSize: size * 0.42, color: PALETTE[i] }}>{name[0]?.toUpperCase()}</Text>
    </View>
  );
}
