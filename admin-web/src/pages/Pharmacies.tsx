import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Empty, Field, Icon, Spinner, fmtDate, money, timeAgo, useLoad, useToast } from '@medfinder/web-shared';
import { api } from '../api';

const TABS = [['pending', 'Requests'], ['approved', 'Approved'], ['suspended', 'Suspended'], ['rejected', 'Rejected'], ['', 'All']];

export default function Pharmacies() {
  const [tab, setTab] = useState('pending');
  const [q, setQ] = useState('');
  const { id } = useParams();
  const nav = useNavigate();
  const { data, loading, reload } = useLoad(() => api.get(`/admin/pharmacies?status=${tab}&q=${encodeURIComponent(q)}`), [tab, q]);
  return (
    <>
      <div className="row-between">
        <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
        <div className="search"><Icon name="search" size={18} /><input className="input" placeholder="Name, email, area, licence…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <div className="card flush">
        {loading && !data ? <Spinner /> : !data.pharmacies.length ? <Empty icon="shield" title={tab === 'pending' ? 'No requests waiting' : 'No pharmacies'} /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Pharmacy</th><th>Location</th><th>Licence</th><th>Status</th><th>Subscription</th><th className="num">Stock</th><th className="num">Orders</th><th>Registered</th></tr></thead>
              <tbody>{data.pharmacies.map((p: any) => (
                <tr key={p.id} className="clickable" onClick={() => nav(`/pharmacies/${p.id}`)}>
                  <td><strong>{p.name}</strong><div className="muted small">{p.email}</div></td>
                  <td>{p.area || '—'}, {p.city}</td>
                  <td className="mono">{p.licenseNumber}</td>
                  <td><Badge>{p.approvalStatus}</Badge>{p.openComplaints > 0 && <span className="badge badge-red" style={{ marginLeft: 4 }}>{p.openComplaints} complaint{p.openComplaints > 1 ? 's' : ''}</span>}</td>
                  <td><Badge>{p.subscriptionStatus}</Badge></td>
                  <td className="num">{p.stockItems}</td>
                  <td className="num">{p.ordersCount}</td>
                  <td className="muted small">{timeAgo(p.createdAt)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      {id && <PharmacyDrawer id={Number(id)} onClose={() => nav('/pharmacies')} onChanged={reload} />}
    </>
  );
}

function PharmacyDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { data, loading, reload } = useLoad(() => api.get(`/admin/pharmacies/${id}`), [id]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const p = data?.pharmacy;

  const decide = async (action: string) => {
    if ((action === 'reject' || action === 'suspend') && !reason.trim()) { toast('Write a reason so the pharmacy knows what to fix', 'err'); return; }
    setBusy(action);
    try { await api.post(`/admin/pharmacies/${id}/decision`, { action, reason: reason.trim() || undefined }); toast(`Pharmacy ${action}d`); setReason(''); reload(); onChanged(); }
    catch (e: any) { toast(e.message, 'err'); } finally { setBusy(''); }
  };
  const extend = async (days: number) => {
    try { await api.post(`/admin/pharmacies/${id}/subscription`, { status: 'active', extendDays: days }); toast(`Subscription extended by ${days} days`); reload(); onChanged(); }
    catch (e: any) { toast(e.message, 'err'); }
  };

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" style={{ width: 'min(620px, 100%)' }}>
        <div className="drawer-head"><div><h2>{p?.name || 'Pharmacy'}</h2>{p && <p className="muted small">Registered {fmtDate(p.createdAt)}</p>}</div><button className="icon-btn" onClick={onClose}><Icon name="x" /></button></div>
        {loading && !p ? <Spinner /> : p && (
          <div className="drawer-body">
            <div className="row"><Badge>{p.approvalStatus}</Badge><Badge>{p.subscriptionStatus}</Badge>{p.rejectionReason && <span className="muted small">Reason: {p.rejectionReason}</span>}</div>
            <div className="card" style={{ padding: 16 }}>
              <h3>Verification details</h3>
              <dl className="kv mt-s">
                <dt>Licence no.</dt><dd className="mono">{p.licenseNumber}</dd>
                <dt>Owner</dt><dd>{p.ownerName}</dd>
                <dt>Email</dt><dd>{p.email}</dd>
                <dt>Phone</dt><dd><a href={`tel:${p.phone}`}>{p.phone}</a></dd>
                <dt>Address</dt><dd>{p.address}, {p.area} {p.city}, {p.region}</dd>
                <dt>Map</dt><dd>{p.lat ? <a href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noreferrer">{p.lat}, {p.lng} ↗</a> : <span style={{ color: 'var(--red)' }}>No location set</span>}</dd>
                <dt>Hours</dt><dd>{p.openingHours || '—'}</dd>
                <dt>Delivery</dt><dd>{p.offersDelivery ? `Yes, ${money(p.deliveryFee)} within ${p.deliveryRadiusKm} km` : 'No'}</dd>
                <dt>About</dt><dd>{p.bio || '—'}</dd>
              </dl>
              <p className="muted small mt-s">Check the licence number against the Pharmacy Council of Ghana register before approving.</p>
            </div>

            <div className="card" style={{ padding: 16, background: 'var(--tint2)' }}>
              <h3>Decision</h3>
              <div className="mt-s"><Field label="Reason / message to pharmacy (needed to reject or suspend)"><textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Licence number could not be verified" style={{ minHeight: 60 }} /></Field></div>
              <div className="row wrap mt">
                {p.approvalStatus !== 'approved' && <Button icon="check" loading={busy === 'approve'} onClick={() => decide(p.approvalStatus === 'suspended' ? 'reinstate' : 'approve')}>{p.approvalStatus === 'suspended' ? 'Reinstate' : 'Approve & go live'}</Button>}
                {p.approvalStatus === 'pending' && <Button variant="danger" icon="x" loading={busy === 'reject'} onClick={() => decide('reject')}>Reject</Button>}
                {p.approvalStatus === 'approved' && <Button variant="danger" icon="alert" loading={busy === 'suspend'} onClick={() => decide('suspend')}>Suspend listing</Button>}
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <h3>Subscription</h3>
              <p className="muted small mt-s">{p.subscriptionStatus} · expires {fmtDate(p.subscriptionExpiresAt)}</p>
              <div className="row wrap mt-s">
                <Button variant="secondary" small onClick={() => extend(30)}>+30 days</Button>
                <Button variant="secondary" small onClick={() => extend(90)}>+90 days</Button>
                <Button variant="ghost" small onClick={() => api.post(`/admin/pharmacies/${id}/subscription`, { status: 'expired' }).then(() => { reload(); onChanged(); })}>Mark expired</Button>
              </div>
            </div>

            <div>
              <div className="row-between"><h3>Stock ({data.stock.length})</h3><span className="muted small">Last update {timeAgo(p.lastSyncAt)}</span></div>
              <div className="table-wrap mt-s" style={{ maxHeight: 260, border: '1px solid var(--line)', borderRadius: 12 }}>
                <table className="table"><thead><tr><th>Medicine</th><th className="num">Price</th><th className="num">Qty</th></tr></thead>
                  <tbody>{data.stock.map((s: any) => <tr key={s.id}><td>{s.name} <span className="muted">{s.strength}</span></td><td className="num">{money(s.price)}</td><td className="num">{s.quantity}</td></tr>)}</tbody></table>
              </div>
            </div>
            {data.complaints.length > 0 && (
              <div><h3>Complaints</h3>
                <div className="list mt-s">{data.complaints.map((c: any) => <div className="list-item" key={c.id}><span className="grow">{c.subject}</span><Badge>{c.status}</Badge><span className="muted small">{timeAgo(c.createdAt)}</span></div>)}</div>
              </div>
            )}
            <div><h3>Orders</h3><div className="row wrap mt-s">{data.orderStats.length ? data.orderStats.map((o: any) => <span key={o.status}><Badge>{o.status}</Badge> {o.n}</span>) : <span className="muted small">No orders yet</span>}</div></div>
          </div>
        )}
      </div>
    </div>
  );
}
