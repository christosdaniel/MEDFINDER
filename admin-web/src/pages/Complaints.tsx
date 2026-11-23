import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Empty, Field, Spinner, fmtDateTime, timeAgo, useLoad, useToast } from '@medfinder/web-shared';
import { api } from '../api';

export default function Complaints() {
  const [status, setStatus] = useState('');
  const [selId, setSelId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const nav = useNavigate();
  const { data, loading, reload } = useLoad(() => api.get(`/admin/complaints?status=${status}`), [status]);
  const sel = data?.complaints.find((c: any) => c.id === selId);

  const update = async (body: any, msg: string) => {
    setBusy(true);
    try { await api.patch(`/admin/complaints/${sel.id}`, { ...body, adminNote: note || undefined }); toast(msg); setNote(''); reload(); }
    catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="tabs">{[['', 'All'], ['open', 'Open'], ['investigating', 'Investigating'], ['resolved', 'Resolved']].map(([k, l]) =>
        <button key={k} className={status === k ? 'active' : ''} onClick={() => setStatus(k)}>{l}</button>)}</div>
      <div className="grid-2" style={{ gridTemplateColumns: '1fr 1.2fr', alignItems: 'start' }}>
        <div className="card flush">
          {loading && !data ? <Spinner /> : !data.complaints.length ? <Empty icon="flag" title="No complaints" text="Nice. Patients haven't reported any problems." /> : (
            <div className="list" style={{ padding: '0 16px' }}>
              {data.complaints.map((c: any) => (
                <div key={c.id} className="list-item" style={{ cursor: 'pointer', background: c.id === selId ? 'var(--tint2)' : undefined }} onClick={() => { setSelId(c.id); setNote(c.adminNote || ''); }}>
                  <div className="grow"><strong>{c.subject}</strong><p className="muted small">{c.pharmacy?.name} · {timeAgo(c.createdAt)}</p></div>
                  <Badge>{c.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          {!sel ? <Empty icon="flag" title="Select a complaint" text="Choose a complaint on the left to see details and take action." /> : (
            <div className="stack">
              <div className="row-between"><h2>{sel.subject}</h2><Badge>{sel.status}</Badge></div>
              <p>{sel.details}</p>
              <dl className="kv">
                <dt>Pharmacy</dt><dd>{sel.pharmacy ? <a href="#" onClick={(e) => { e.preventDefault(); nav(`/pharmacies/${sel.pharmacy.id}`); }}>{sel.pharmacy.name}</a> : '—'} {sel.pharmacy && <Badge>{sel.pharmacy.approvalStatus}</Badge>}</dd>
                <dt>Reported by</dt><dd>{sel.patient ? `${sel.patient.name} (${sel.patient.phone})` : 'Deleted user'}</dd>
                {sel.orderCode && (<><dt>Order</dt><dd>{sel.orderCode}</dd></>)}
                <dt>Received</dt><dd>{fmtDateTime(sel.createdAt)}</dd>
                {sel.resolvedAt && (<><dt>Resolved</dt><dd>{fmtDateTime(sel.resolvedAt)}</dd></>)}
              </dl>
              <Field label="Note (sent to the patient when resolved, and to the pharmacy if you warn them)"><textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              <div className="row wrap">
                {sel.status === 'open' && <Button variant="secondary" loading={busy} onClick={() => update({ status: 'investigating' }, 'Marked as investigating')}>Start investigating</Button>}
                <Button variant="secondary" loading={busy} onClick={() => update({ warnPharmacy: true }, 'Warning sent to pharmacy')}>Warn pharmacy</Button>
                {sel.status !== 'resolved' && <Button icon="check" loading={busy} onClick={() => update({ status: 'resolved' }, 'Complaint resolved')}>Resolve</Button>}
                {sel.pharmacy && <Button variant="danger" onClick={() => nav(`/pharmacies/${sel.pharmacy.id}`)}>Review / suspend pharmacy</Button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
