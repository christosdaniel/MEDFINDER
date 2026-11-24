// Profile pictures (patients, pharmacies), full-screen photo viewer, and the
// photo picker (gallery or camera).
import { useState } from 'react';
import { Image, Modal, Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { imageUrl } from '../lib/api';
import { colors } from '../lib/theme';
import { show } from '../lib/dialog';

/** Round (person) or rounded-square (pharmacy) picture with a letter fallback. */
export function ProfilePic({ imageId, label, size = 44, round = true, icon }: { imageId?: number | null; label: string; size?: number; round?: boolean; icon?: keyof typeof Ionicons.glyphMap }) {
  const [failed, setFailed] = useState(false);
  const uri = imageUrl(imageId);
  const r = round ? size / 2 : size * 0.28;
  if (uri && !failed) return <Image source={{ uri }} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: r, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line }} accessibilityLabel={label} />;
  return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
      {icon ? <Ionicons name={icon} size={size * 0.48} color={colors.green3} /> : <Text style={{ color: colors.green, fontWeight: '700', fontSize: size * 0.4 }}>{(label || '?')[0].toUpperCase()}</Text>}
    </View>
  );
}

/** Tap a medicine photo to see it full screen. */
export function PhotoViewer({ imageId, title, onClose }: { imageId: number | null; title?: string; onClose: () => void }) {
  const uri = imageUrl(imageId);
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        {uri && <Image source={{ uri }} style={{ width: '100%', height: '70%' }} resizeMode="contain" />}
        {title && <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>{title}</Text>}
        <Text style={{ color: '#cfd8d3', marginTop: 8 }}>Tap anywhere to close</Text>
      </Pressable>
    </Modal>
  );
}

export type PickedPhoto = ImagePicker.ImagePickerAsset;

/** Let the user pick a photo from the gallery or take one with the camera (square crop). */
export async function pickPhoto(source: 'library' | 'camera'): Promise<PickedPhoto | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 };
  if (source === 'camera' && Platform.OS !== 'web') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { show('Camera not allowed', 'Allow camera access for MedFinder in your phone settings to take a photo.'); return null; }
    const r = await ImagePicker.launchCameraAsync(options);
    return r.canceled ? null : r.assets[0];
  }
  if (Platform.OS !== 'web') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { show('Photos not allowed', 'Allow photo access for MedFinder in your phone settings to choose a picture.'); return null; }
  }
  const r = await ImagePicker.launchImageLibraryAsync(options);
  return r.canceled ? null : r.assets[0];
}
