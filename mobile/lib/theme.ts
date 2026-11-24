export const colors = {
  green: '#0b4a2e',
  green2: '#23a455',
  green3: '#2e7d5b',
  tint: '#e7f1ec',
  tint2: '#f1f7f3',
  bg: '#f4f8f5',
  white: '#ffffff',
  text: '#173229',
  muted: '#5b6b62',
  line: '#dce6e0',
  amber: '#fdf1d8',
  amberText: '#8b5d0a',
  red: '#b5452f',
  redBg: '#fbe9e5',
  blue: '#1d5fa5',
  blueBg: '#e6f1fb',
};
export const radius = { s: 10, m: 14, l: 20 };
export const shadow = {
  shadowColor: '#0b4a2e',
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};
export const money = (n?: number | null) => (n === null || n === undefined ? '—' : `GH₵ ${Number(n).toFixed(2)}`);
export const km = (d?: number | null) => (d === null || d === undefined ? '' : d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`);

const parse = (s?: string | null) => (s ? new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z') : null);
export function timeAgo(s?: string | null) {
  const d = parse(s);
  if (!d) return '';
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hr ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
export const fmtDateTime = (s?: string | null) =>
  parse(s)?.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) ?? '';
