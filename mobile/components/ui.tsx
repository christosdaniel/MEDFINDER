import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle, type StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, radius, shadow } from '../lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, style, small }: {
  title: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: IconName;
  loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; small?: boolean;
}) {
  const v = btn[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [s.btn, small && s.btnSmall, v.box, (disabled || loading) && { opacity: 0.55 }, pressed && { opacity: 0.85 }, style]}
    >
      {loading ? <ActivityIndicator color={v.text.color} /> : icon && <Ionicons name={icon} size={small ? 16 : 18} color={v.text.color} />}
      <Text style={[s.btnText, small && { fontSize: 13 }, v.text]}>{title}</Text>
    </Pressable>
  );
}
const btn = {
  primary: { box: { backgroundColor: colors.green }, text: { color: '#fff' } },
  secondary: { box: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line }, text: { color: colors.green } },
  ghost: { box: { backgroundColor: 'transparent' }, text: { color: colors.green3 } },
  danger: { box: { backgroundColor: colors.redBg }, text: { color: colors.red } },
};

export function Input({ label, error, hint, icon, secureTextEntry, ...props }: TextInputProps & { label?: string; error?: string; hint?: string; icon?: IconName }) {
  // Password fields get an eye button to show/hide what was typed.
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={s.label}>{label}</Text>}
      <View style={[s.inputWrap, !!error && { borderColor: colors.red }]}>
        {icon && <Ionicons name={icon} size={18} color={colors.muted} />}
        <TextInput placeholderTextColor="#94a39b" style={s.input} secureTextEntry={secureTextEntry && !visible} autoCapitalize={secureTextEntry ? 'none' : props.autoCapitalize} autoCorrect={secureTextEntry ? false : props.autoCorrect} {...props} />
        {secureTextEntry && (
          <Pressable onPress={() => setVisible((v) => !v)} hitSlop={10} accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'}>
            <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
          </Pressable>
        )}
      </View>
      {error ? <Text style={[s.hint, { color: colors.red }]}>{error}</Text> : hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.9 }]}>{children}</Pressable>;
  }
  return <View style={[s.card, style]}>{children}</View>;
}

const TONES: Record<string, [string, string]> = {
  green: [colors.tint, colors.green3], amber: [colors.amber, colors.amberText], red: [colors.redBg, colors.red],
  blue: [colors.blueBg, colors.blue], grey: ['#eef1ef', colors.muted],
};
const AUTO: Record<string, string> = {
  Available: 'green', 'Low stock': 'amber', 'Out of stock': 'red', pending: 'amber', accepted: 'blue', preparing: 'amber',
  ready: 'green', out_for_delivery: 'blue', completed: 'green', cancelled: 'red', rejected: 'red',
};
export function Badge({ label, tone }: { label: string; tone?: string }) {
  const [bg, fg] = TONES[tone || AUTO[label] || 'grey'];
  return <View style={[s.badge, { backgroundColor: bg }]}><Text style={[s.badgeText, { color: fg }]}>{label}</Text></View>;
}

export function Header({ title, subtitle, back = true, right }: { title: string; subtitle?: string; back?: boolean; right?: ReactNode }) {
  const router = useRouter();
  return (
    <View style={s.header}>
      {back && (
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.iconBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={colors.green} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
        {subtitle && <Text style={s.muted} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

export function Empty({ icon = 'medkit-outline', title, text, action }: { icon?: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}><Ionicons name={icon} size={28} color={colors.green3} /></View>
      <Text style={s.h3}>{title}</Text>
      {text && <Text style={[s.muted, { textAlign: 'center', maxWidth: 280 }]}>{text}</Text>}
      {action}
    </View>
  );
}

export const Loading = () => <View style={{ padding: 40 }}><ActivityIndicator color={colors.green} /></View>;
export const ErrorBox = ({ text }: { text: string }) => <View style={s.errorBox}><Ionicons name="alert-circle" size={18} color={colors.red} /><Text style={{ color: colors.red, flex: 1 }}>{text}</Text></View>;

export function Section({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children: ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={s.rowBetween}>
        <Text style={s.h3}>{title}</Text>
        {action && <Pressable onPress={onAction}><Text style={{ color: colors.green3, fontWeight: '600' }}>{action}</Text></Pressable>}
      </View>
      {children}
    </View>
  );
}

export function Avatar({ letter, size = 44, color = colors.green }: { letter: string; size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color, fontWeight: '700', fontSize: size * 0.4 }}>{letter.toUpperCase()}</Text>
    </View>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && { backgroundColor: colors.green, borderColor: colors.green }]}>
      {icon && <Ionicons name={icon} size={14} color={active ? '#fff' : colors.muted} />}
      <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 18, gap: 18 },
  h1: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  h2: { fontSize: 20, fontWeight: '700', color: colors.text },
  h3: { fontSize: 16, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  muted: { fontSize: 13, color: colors.muted },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  hint: { fontSize: 12, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.s + 2, paddingVertical: 14, paddingHorizontal: 18 },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.s },
  btnText: { fontSize: 15, fontWeight: '700' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: radius.s + 2, backgroundColor: '#fff', paddingHorizontal: 14 },
  input: { flex: 1, paddingVertical: 13, fontSize: 15, color: colors.text },
  card: { backgroundColor: '#fff', borderRadius: radius.m, padding: 16, borderWidth: 1, borderColor: colors.line, ...shadow },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.line },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  iconBtn: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', padding: 32, gap: 8 },
  emptyIcon: { width: 60, height: 60, borderRadius: 18, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  errorBox: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.redBg, padding: 12, borderRadius: radius.s },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff' },
  divider: { height: 1, backgroundColor: colors.line },
});
