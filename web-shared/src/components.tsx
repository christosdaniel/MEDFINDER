import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import './styles.css';

const PATHS: Record<string, ReactNode> = {
  search: (<><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>),
  home: (<><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>),
  bag: (<><path d="M6 8h12l1 12H5L6 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></>),
  pin: (<><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-5 3.5-7 8-7s7.2 2 8 7" /></>),
  users: (<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-4 3-6 6.5-6s5.9 2 6.5 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .6 3.2 2.5 3.5 6" /></>),
  arrow: <path d="m9 18 6-6-6-6" />,
  back: <path d="m15 18-6-6 6-6" />,
  check: <path d="m5 12 4 4L19 6" />,
  phone: <path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2c-3-1.2-5.8-4-7-7l2-2-2-5Z" />,
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></>),
  truck: (<><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>),
  edit: (<><path d="m14 5 5 5L9 20H4v-5Z" /><path d="m13 6 5 5" /></>),
  plus: <path d="M12 5v14M5 12h14" />,
  bell: (<><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8" /><path d="M10 21h4" /></>),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  box: (<><path d="m4 7 8-4 8 4-8 4Z" /><path d="m4 7 8 4 8-4v10l-8 4-8-4Z" /><path d="M12 11v10" /></>),
  card: (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></>),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  file: (<><path d="M6 3h8l4 4v14H6Z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>),
  upload: (<><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v4h16v-4" /></>),
  download: (<><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 16v4h16v-4" /></>),
  link: (<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>),
  settings: (<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>),
  logout: (<><path d="M15 4h4v16h-4" /><path d="M10 17l-5-5 5-5M5 12h11" /></>),
  shield: (<><path d="M12 3 4 6v6c0 5 3.4 8.5 8 9 4.6-.5 8-4 8-9V6Z" /><path d="m9 12 2 2 4-4" /></>),
  flag: (<><path d="M5 21V4" /><path d="M5 4h12l-2 4 2 4H5" /></>),
  megaphone: (<><path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1Z" /><path d="M16 9a3 3 0 0 1 0 6M19 6a7 7 0 0 1 0 12" /></>),
  alert: (<><path d="M12 3 2 20h20Z" /><path d="M12 10v4M12 17v.5" /></>),
  pill: (<><rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)" /><path d="m9 9 6 6" /></>),
  refresh: (<><path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4" /></>),
  trash: (<><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>),
  copy: (<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4v12h4" /></>),
  whatsapp: (<><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7Z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2Z" /></>),
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}

export function Logo({ subtitle }: { subtitle?: string }) {
  return (
    <div className="logo">
      <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="" className="logo-mark" />
      <span className="logo-text">
        <span>MED<b>FINDER</b></span>
        {subtitle && <small>{subtitle}</small>}
      </span>
    </div>
  );
}

type BtnProps = {
  children?: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: string;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit';
  title?: string;
  small?: boolean;
};
export function Button({ children, onClick, variant = 'primary', icon, className = '', disabled, loading, type = 'button', title, small }: BtnProps) {
  return (
    <button type={type} title={title} className={`btn btn-${variant} ${small ? 'btn-sm' : ''} ${className}`} onClick={onClick} disabled={disabled || loading}>
      {loading ? <span className="spinner" /> : icon && <Icon name={icon} size={small ? 16 : 18} />}
      {children}
    </button>
  );
}

const TONES: Record<string, string> = {
  Available: 'green', approved: 'green', active: 'green', completed: 'green', resolved: 'green', Ready: 'green',
  'Low stock': 'amber', pending: 'amber', trial: 'amber', investigating: 'amber', preparing: 'amber', accepted: 'blue', ready: 'green', out_for_delivery: 'blue', open: 'amber',
  'Out of stock': 'red', rejected: 'red', suspended: 'red', expired: 'red', cancelled: 'red',
};
export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const t = tone || TONES[String(children)] || 'grey';
  const text = String(children).replace(/_/g, ' ');
  return <span className={`badge badge-${t}`}>{text.charAt(0).toUpperCase() + text.slice(1)}</span>;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className={`field ${error ? 'field-error' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-hint err">{error}</span> : hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ icon = 'box', title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon} size={26} /></span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export const Spinner = ({ label = 'Loading…' }: { label?: string }) => (
  <div className="loading"><span className="spinner dark" /> {label}</div>
);

export function Stat({ label, value, icon, tone = 'green', sub }: { label: string; value: ReactNode; icon: string; tone?: string; sub?: ReactNode }) {
  return (
    <div className="card stat">
      <span className={`stat-icon tone-${tone}`}><Icon name={icon} /></span>
      <div>
        <p className="muted">{label}</p>
        <h2>{value}</h2>
        {sub && <p className="stat-sub">{sub}</p>}
      </div>
    </div>
  );
}

// ---------- Toasts ----------
type Toast = { id: number; text: string; tone: 'ok' | 'err' };
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'err') => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}><Icon name={t.tone === 'ok' ? 'check' : 'alert'} size={18} />{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Load data with loading/error state and a reload function. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    return fn().then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

/** A simple bar chart with no extra dependencies. */
export function Bars({ data, valueKey, labelKey, format = (v: number) => String(v) }: { data: any[]; valueKey: string; labelKey: string; format?: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey]) || 0));
  if (!data.length) return <p className="muted small">No data yet.</p>;
  return (
    <div className="bars">
      {data.map((d) => (
        <div className="bar-col" key={d[labelKey]} title={`${d[labelKey]}: ${format(Number(d[valueKey]))}`}>
          <span className="bar-val">{format(Number(d[valueKey]))}</span>
          <div className="bar" style={{ height: `${(Number(d[valueKey]) / max) * 100}%` }} />
          <span className="bar-label">{String(d[labelKey]).slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

type Notif = { id: number; title: string; body: string; read: boolean; createdAt: string; data?: any };
/** Bell with unread count; polls every 30s. */
export function NotificationBell({ load, markRead, onOpenItem, timeAgo }: {
  load: () => Promise<{ unread: number; notifications: Notif[] }>;
  markRead: () => Promise<unknown>;
  onOpenItem?: (n: Notif) => void;
  timeAgo: (s: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ unread: number; notifications: Notif[] }>({ unread: 0, notifications: [] });
  const refresh = useCallback(() => { load().then(setData).catch(() => {}); }, [load]);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);
  const toggle = () => {
    setOpen((o) => !o);
    if (!open && data.unread) markRead().then(() => setTimeout(refresh, 1500));
  };
  return (
    <div style={{ position: 'relative' }}>
      <button className="icon-btn" onClick={toggle} aria-label="Notifications">
        <Icon name="bell" />
        {data.unread > 0 && <span className="dot">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div className="notif-panel">
            <div className="head"><h3>Notifications</h3><button className="icon-btn" onClick={() => setOpen(false)}><Icon name="x" size={18} /></button></div>
            {data.notifications.length === 0 && <p className="muted small" style={{ padding: 16 }}>You're all caught up.</p>}
            {data.notifications.map((n) => (
              <div key={n.id} className={`notif ${n.read ? '' : 'unread'}`} style={{ cursor: onOpenItem ? 'pointer' : 'default' }}
                onClick={() => { if (onOpenItem) { onOpenItem(n); setOpen(false); } }}>
                <div className="row-between"><strong>{n.title}</strong><span className="muted small">{timeAgo(n.createdAt)}</span></div>
                <p>{n.body}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Picture with a coloured-letter fallback. `round` for people, square-ish for things. */
export function Thumb({ src, label, size = 40, round = false }: { src?: string | null; label: string; size?: number; round?: boolean }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, borderRadius: round ? '50%' : Math.round(size * 0.25), flexShrink: 0 } as const;
  if (src && !failed) return <img src={src} alt={label} onError={() => setFailed(true)} style={{ ...style, objectFit: 'cover', background: '#fff', border: '1px solid var(--line)' }} />;
  return <span className="avatar" style={{ ...style, fontSize: Math.round(size * 0.42) }} aria-label={label}>{(label || '?').trim()[0]?.toUpperCase()}</span>;
}

/**
 * Click-to-upload picture. Opens the file picker (or camera on phones),
 * calls onUpload with the chosen file and shows a spinner meanwhile.
 */
export function PhotoPicker({ src, label, size = 96, round = false, onUpload, onRemove, hint }: {
  src?: string | null; label: string; size?: number; round?: boolean;
  onUpload: (file: File) => Promise<unknown>; onRemove?: () => Promise<unknown>; hint?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pick = (file?: File | null) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('That photo is over 10 MB. Choose a smaller one.'); return; }
    setBusy(true); setError('');
    onUpload(file).catch((e) => setError(e.message)).finally(() => setBusy(false));
  };
  return (
    <div className="row" style={{ gap: 16, alignItems: 'center' }}>
      <label style={{ position: 'relative', cursor: 'pointer' }} title="Change picture">
        <Thumb src={src} label={label} size={size} round={round} />
        <span style={{ position: 'absolute', right: -4, bottom: -4, width: 30, height: 30, borderRadius: '50%', background: 'var(--green)', color: '#fff', display: 'grid', placeItems: 'center', border: '2px solid #fff' }}>
          {busy ? <span className="spinner" /> : <Icon name="edit" size={14} />}
        </span>
        <input type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      <div className="stack" style={{ gap: 6 }}>
        <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', width: 'fit-content' }}>
          <Icon name="upload" size={16} /> {src ? 'Change picture' : 'Upload picture'}
          <input type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {src && onRemove && <button type="button" className="btn btn-ghost btn-sm" style={{ width: 'fit-content' }} onClick={() => { setBusy(true); onRemove().finally(() => setBusy(false)); }}>Remove</button>}
        {hint && <span className="muted small">{hint}</span>}
        {error && <span className="small" style={{ color: 'var(--red)' }}>{error}</span>}
      </div>
    </div>
  );
}
