import { Alert, Platform } from 'react-native';

export function show(title: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${msg}`); else Alert.alert(title, msg);
}
export function confirmBox(title: string, msg: string, onYes: () => void) {
  if (Platform.OS === 'web') { if (window.confirm(`${title}\n\n${msg}`)) onYes(); return; }
  Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Continue', onPress: onYes }]);
}
