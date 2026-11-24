// Web fallback: OpenStreetMap embed (react-native-maps doesn't run on web).
import { createElement } from 'react';
import { View } from 'react-native';
import type { Pin } from './PharmacyMap';

export type { Pin };

export default function PharmacyMap({ pins, me, height = 220 }: { pins: Pin[]; me?: { lat: number; lng: number } | null; height?: number; onPressPin?: (id: number) => void }) {
  const c = pins[0] || me || { lat: 5.56, lng: -0.2 };
  const d = pins.length > 1 ? 0.06 : 0.008;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${c.lng - d},${c.lat - d},${c.lng + d},${c.lat + d}&layer=mapnik&marker=${c.lat},${c.lng}`;
  return (
    <View style={{ height, borderRadius: 14, overflow: 'hidden' }}>
      {createElement('iframe', { src, title: 'Map', style: { border: 0, width: '100%', height: '100%' } })}
    </View>
  );
}
