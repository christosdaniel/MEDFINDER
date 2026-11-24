import { useEffect, useState } from 'react';
import { Button, Field, Spinner, fmtDate, timeAgo, useLoad, useToast } from '@medfinder/web-shared';
import { api } from '../api';

export default function Settings() {
  return (<><SystemSettings /><div className="grid-2" style={{ alignItems: 'start' }}><Admins /><Password /></div><Audit /></>);
}

function SystemSettings() {
  const toast = useToast();
  const { data } = useLoad(() => api.get('/admin/settings'));
  const [f, setF] = useState<Record<string, string>>({});
  useEffect(() => { if (data) setF(data.settings); }, [data]);
  if (!data) return <Spinner />;
  const save = () => api.patch('/admin/settings', f).then(() => toast('Settings saved')).catch((e) => toast(e.message, 'err'));
  return (
    <div className="card stack">
      <h3>System settings</h3>
      <div className="grid-4">
        <Field label="Subscription price (GH₵ / month)"><input type="number" value={f.subscription_price_ghs || ''} onChange={(e) => setF({ ...f, subscription_price_ghs: e.target.value })} /></Field>
        <Field label="Free trial for new pharmacies (days)"><input type="number" value={f.trial_days || ''} onChange={(e) => setF({ ...f, trial_days: e.target.value })} /></Field>
        <Field label="Support phone"><input value={f.support_phone || ''} onChange={(e) => setF({ ...f, support_phone: e.target.value })} /></Field>
        <Field label="Minimum app version" hint="Older patient apps are asked to update"><input value={f.min_app_version || ''} onChange={(e) => setF({ ...f, min_app_version: e.target.value })} /></Field>
      </div>
      <div><Button onClick={save}>Save settings</Button></div>
    </div>
  );
}

function Admins() {
  const toast = useToast();
  const { data, reload } = useLoad(() => api.get('/admin/admins'));
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const add = () => api.post('/admin/admins', f).then(() => { toast('Admin added'); setF({ name: '', email: '', password: '' }); reload(); }).catch((e) => toast(e.message, 'err'));
  return (
    <div className="card stack">
      <h3>Admin accounts</h3>
      <div className="list">{data?.admins.map((a: any) => <div className="list-item" key={a.id}><span className="avatar">{a.name[0]}</span><div className="grow"><strong>{a.name}</strong><p className="muted small">{a.email}</p></div><span className="muted small">since {fmtDate(a.createdAt)}</span></div>)}</div>
      <div className="grid-3">
        <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email"><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Temporary password"><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      </div>
      <div><Button variant="secondary" onClick={add} disabled={!f.name || !f.email || f.password.length < 8}>Add admin</Button></div>
    </div>
  );
}

function Password() {
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const save = () => api.post('/admin/me/password', { currentPassword: cur, newPassword: nw }).then(() => { toast('Password changed'); setCur(''); setNw(''); }).catch((e) => toast(e.message, 'err'));
  return (
    <div className="card stack">
      <h3>Change your password</h3>
      <Field label="Current password"><input type="password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
      <Field label="New password" hint="At least 8 characters"><input type="password" value={nw} onChange={(e) => setNw(e.target.value)} /></Field>
      <div><Button variant="secondary" onClick={save} disabled={!cur || nw.length < 8}>Update password</Button></div>
    </div>
  );
}

function Audit() {
  const { data } = useLoad(() => api.get('/admin/audit'));
  return (
    <div className="card flush">
      <div className="card-head"><h3>Audit log</h3></div>
      <div className="table-wrap" style={{ maxHeight: 360 }}><table className="table">
        <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th></tr></thead>
        <tbody>{data?.entries.map((e: any) => <tr key={e.id}><td className="muted small">{timeAgo(e.createdAt)}</td><td>{e.admin}</td><td className="mono">{e.action}</td><td className="mono muted">{e.target || '—'}</td></tr>)}</tbody>
      </table></div>
    </div>
  );
}
