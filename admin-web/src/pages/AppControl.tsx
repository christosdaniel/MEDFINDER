import { useState } from 'react';
import { Badge, Button, Empty, Field, Modal, Spinner, timeAgo, useLoad, useToast } from '@medfinder/web-shared';
import { api } from '../api';

const AUDIENCE: Record<string, string> = { patient: 'Patient app', pharmacy: 'Pharmacy portal', all: 'Both apps' };

export default function AppControl() {
  return (
    <>
      <div className="info-box">Changes here take effect in the patient mobile app and the pharmacy portal the next time they load (no app update needed).</div>
      <Features />
      <Announcements />
    </>
  );
}

function Features() {
  const toast = useToast();
  const { data, loading, reload, setData } = useLoad(() => api.get('/admin/features'));
  const [adding, setAdding] = useState(false);
  const toggle = async (f: any) => {
    setData((d: any) => ({ features: d.features.map((x: any) => (x.key === f.key ? { ...x, enabled: !f.enabled } : x)) }));
    try { await api.patch(`/admin/features/${f.key}`, { enabled: !f.enabled }); toast(`${f.label} ${f.enabled ? 'switched off' : 'switched on'}`); }
    catch (e: any) { toast(e.message, 'err'); reload(); }
  };
  return (
    <div className="card flush">
      <div className="card-head"><div><h3>Feature switches</h3><p className="muted small">Turn features on or off for patients and pharmacies.</p></div><Button variant="secondary" icon="plus" small onClick={() => setAdding(true)}>New feature</Button></div>
      {loading && !data ? <Spinner /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Feature</th><th>Applies to</th><th>Key</th><th>Changed</th><th>On</th></tr></thead>
          <tbody>{data.features.map((f: any) => (
            <tr key={f.key}>
              <td><strong>{f.label}</strong><div className="muted small">{f.description}</div></td>
              <td><Badge tone="grey">{AUDIENCE[f.audience]}</Badge></td>
              <td className="mono muted">{f.key}</td>
              <td className="muted small">{timeAgo(f.updatedAt)}</td>
              <td><label className="switch"><input type="checkbox" checked={f.enabled} onChange={() => toggle(f)} /><span /></label></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {adding && <NewFeature onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
    </div>
  );
}

function NewFeature({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ key: '', label: '', description: '', audience: 'all', enabled: false });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.post('/admin/features', f); toast('Feature added'); onDone(); } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Modal title="New feature switch" onClose={onClose}>
      <div className="stack">
        <p className="muted small">Use this to stage a new feature. The apps read the key (e.g. <code>prescription_upload</code>) and show the feature only when it's switched on.</p>
        <Field label="Key"><input value={f.key} onChange={(e) => setF({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} placeholder="prescription_upload" /></Field>
        <Field label="Name"><input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
        <Field label="Description"><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Applies to"><select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>{Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <label className="check"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Switch on now</label>
        <Button onClick={save} loading={busy}>Add feature</Button>
      </div>
    </Modal>
  );
}

function Announcements() {
  const toast = useToast();
  const { data, loading, reload } = useLoad(() => api.get('/admin/announcements'));
  const [f, setF] = useState({ title: '', body: '', audience: 'all' });
  const [busy, setBusy] = useState(false);
  const post = async () => {
    setBusy(true);
    try { await api.post('/admin/announcements', f); toast('Announcement published'); setF({ title: '', body: '', audience: 'all' }); reload(); }
    catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <div className="card stack">
        <h3>Publish an announcement</h3>
        <p className="muted small">Shown as a banner in the apps. Use it for new features, holiday hours or maintenance notices.</p>
        <Field label="Title"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="New: order delivery in Kumasi" /></Field>
        <Field label="Message"><textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <Field label="Show in"><select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>{Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Button icon="megaphone" onClick={post} loading={busy} disabled={!f.title || !f.body}>Publish</Button>
      </div>
      <div className="card flush">
        <div className="card-head"><h3>Announcements</h3></div>
        {loading && !data ? <Spinner /> : !data.announcements.length ? <Empty icon="megaphone" title="No announcements" /> : (
          <div className="list" style={{ padding: '0 20px' }}>{data.announcements.map((a: any) => (
            <div className="list-item" key={a.id} style={{ alignItems: 'flex-start' }}>
              <div className="grow"><strong>{a.title}</strong><p className="muted small">{a.body}</p><p className="small mt-s"><Badge tone="grey">{AUDIENCE[a.audience]}</Badge> <span className="muted">{timeAgo(a.createdAt)}</span></p></div>
              <label className="switch" title="Visible"><input type="checkbox" checked={a.active} onChange={() => api.patch(`/admin/announcements/${a.id}`, { active: !a.active }).then(reload)} /><span /></label>
              <button className="icon-btn" title="Delete" onClick={() => confirm('Delete announcement?') && api.del(`/admin/announcements/${a.id}`).then(reload)}>✕</button>
            </div>
          ))}</div>
        )}
      </div>
    </div>
  );
}
