// Native map (iOS/Android) showing pharmacy pins and the patient's location.
import MapView, { Marker } from 'react-native-maps';
import { colors } from '../lib/theme';

export type Pin = { id: number; lat: number; lng: number; title: string; subtitle?: string };

export default function PharmacyMap({ pins, me, height = 220, onPressPin }: {
  pins: Pin[]; me?: { lat: number; lng: number } | null; height?: number; onPressPin?: (id: number) => void;
}) {
  const center = pins[0] || me || { lat: 5.56, lng: -0.2 };
  const pts = [...pins, ...(me ? [me] : [])];
  const latD = pts.length > 1 ? Math.max(...pts.map((p) => p.lat)) - Math.min(...pts.map((p) => p.lat)) : 0;
  const lngD = pts.length > 1 ? Math.max(...pts.map((p) => p.lng)) - Math.min(...pts.map((p) => p.lng)) : 0;
  return (
    <MapView
      style={{ height, borderRadius: 14 }}
      showsUserLocation={!!me}
      initialRegion={{
        latitude: pts.length > 1 ? (Math.max(...pts.map((p) => p.lat)) + Math.min(...pts.map((p) => p.lat))) / 2 : center.lat,
        longitude: pts.length > 1 ? (Math.max(...pts.map((p) => p.lng)) + Math.min(...pts.map((p) => p.lng))) / 2 : center.lng,
        latitudeDelta: Math.max(0.02, latD * 1.5),
        longitudeDelta: Math.max(0.02, lngD * 1.5),
      }}
    >
      {pins.map((p) => (
        <Marker key={p.id} coordinate={{ latitude: p.lat, longitude: p.lng }} title={p.title} description={p.subtitle}
          pinColor={colors.green} onCalloutPress={() => onPressPin?.(p.id)} />
      ))}
    </MapView>
  );
}
