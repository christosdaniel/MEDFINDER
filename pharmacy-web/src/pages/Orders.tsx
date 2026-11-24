import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Empty, Field, Icon, Spinner, fmtDateTime, money, timeAgo, useLoad, useToast } from '@medfinder/web-shared';
import { api, type Order } from '../api';
import { useAuth } from '../auth';

const TABS = [
  ['pending', 'New'],
  ['active', 'In progress'],
  ['history', 'Completed & cancelled'],
] as const;

export default function Orders() {
  const [tab, setTab] = useState<string>('pending');
  const { id } = useParams();
  const nav = useNavigate();
  const { data, loading, reload } = useLoad(() => api.get<{ orders: Order[]; counts: Record<string, number> }>(`/pharmacy/orders?status=${tab}`), [tab]);

  // Refresh the list every 20s so new orders appear without reloading.
  useEffect(() => { const t = setInterval(reload, 20000); return () => clearInterval(t); }, [reload]);

  const c = data?.counts || {};
  const counts: Record<string, number> = {
    pending: c.pending || 0,
    active: (c.accepted || 0) + (c.preparing || 0) + (c.ready || 0) + (c.out_for_delivery || 0),
    history: (c.completed || 0) + (c.cancelled || 0) + (c.rejected || 0),
  };

  return (
    <>
      <div className="row-between">
        <div className="tabs">
          {TABS.map(([k, l]) => (
            <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l} <span className="count">{counts[k]}</span></button>
          ))}
        </div>
        <Button variant="secondary" icon="refresh" onClick={reload}>Refresh</Button>
      </div>
      <div className="card flush">
        {loading && !data ? <Spinner /> : !data?.orders.length ? (
          <Empty icon="bag" title={tab === 'pending' ? 'No new orders' : 'Nothing here yet'} text={tab === 'pending' ? 'New orders from patients will appear here. We check every few seconds.' : undefined} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Order</th><th>Patient</th><th>Medicines</th><th>Method</th><th className="num">Total</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.id} className="clickable" onClick={() => nav(`/orders/${o.id}`)}>
                    <td><strong>{o.code}</strong><div className="muted small">{timeAgo(o.createdAt)}</div></td>
                    <td>{o.patient.name}<div className="muted small">{o.patient.phone}</div></td>
                    <td>{o.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}</td>
                    <td><span className="row" style={{ gap: 6 }}><Icon name={o.method === 'delivery' ? 'truck' : 'bag'} size={16} /><span style={{ textTransform: 'capitalize' }}>{o.method}</span></span></td>
                    <td className="num">{money(o.total)}</td>
                    <td><Badge>{o.status}</Badge></td>
                    <td><Icon name="arrow" size={18} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {id && <OrderDrawer id={Number(id)} onClose={() => nav('/orders')} onChanged={reload} />}
    </>
  );
}

const ACTION_LABEL: Record<string, { label: string; icon: string; variant?: 'primary' | 'secondary' | 'danger' }> = {
  accepted: { label: 'Accept order', icon: 'check' },
  rejected: { label: 'Decline', icon: 'x', variant: 'danger' },
  preparing: { label: 'Start preparing', icon: 'box' },
  ready: { label: 'Mark ready for pickup', icon: 'check' },
  out_for_delivery: { label: 'Send out for delivery', icon: 'truck' },
  completed: { label: 'Mark completed', icon: 'check' },
  cancelled: { label: 'Cancel order', icon: 'x', variant: 'danger' },
};

function OrderDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { pharmacy } = useAuth();
  const { data, loading, error, setData } = useLoad(() => api.get<{ order: Order }>(`/pharmacy/orders/${id}`), [id]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const o = data?.order;

  const move = async (status: string) => {
    if ((status === 'rejected' || status === 'cancelled') && !note.trim()) { toast('Add a short note telling the patient why', 'err'); return; }
    setBusy(status);
    try {
      const r = await api.post(`/pharmacy/orders/${id}/status`, { status, note: note.trim() || undefined });
      setData({ order: { ...r.order, patientCompletedOrders: o?.patientCompletedOrders } });
      setNote('');
      toast(`Order ${r.order.code}: ${r.order.statusText}`);
      onChanged();
    } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(''); }
  };

  const wa = (phone: string) => `https://wa.me/${phone.replace(/[^0-9]/g, '')}`;

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <div className="drawer-head">
          <div><h2>{o?.code || 'Order'}</h2>{o && <p className="muted small">Placed {fmtDateTime(o.createdAt)}</p>}</div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" /></button>
        </div>
        {loading && !o ? <Spinner /> : error ? <div className="drawer-body"><div className="error-box">{error}</div></div> : o && (
          <div className="drawer-body">
            <div className="row-between"><Badge>{o.status}</Badge><span className="muted small">{o.statusText}</span></div>

            <div className="card" style={{ padding: 16 }}>
              <h3>Patient details</h3>
              <dl className="kv mt-s">
                <dt>Name</dt><dd>{o.patient.name}</dd>
                <dt>Phone</dt><dd><a href={`tel:${o.patient.phone}`}>{o.patient.phone}</a></dd>
                {o.patient.email && (<><dt>Email</dt><dd>{o.patient.email}</dd></>)}
                <dt>Past orders</dt><dd>{o.patientCompletedOrders ?? 0} completed with you</dd>
              </dl>
              <div className="row mt">
                <a className="btn btn-secondary btn-sm" href={`tel:${o.patient.phone}`}><Icon name="phone" size={16} /> Call</a>
                <a className="btn btn-secondary btn-sm" href={wa(o.patient.phone)} target="_blank" rel="noreferrer"><Icon name="whatsapp" size={16} /> WhatsApp</a>
                <a className="btn btn-secondary btn-sm" href={`sms:${o.patient.phone}`}>SMS</a>
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <h3><Icon name={o.method === 'delivery' ? 'truck' : 'bag'} size={18} /> {o.method === 'delivery' ? 'Delivery' : 'Pickup at pharmacy'}</h3>
              {o.method === 'delivery' && (
                <dl className="kv mt-s">
                  <dt>Address</dt><dd>{o.deliveryAddress}</dd>
                  {o.deliveryLat && (<><dt>Map</dt><dd><a href={`https://www.google.com/maps/dir/?api=1&origin=${pharmacy?.lat},${pharmacy?.lng}&destination=${o.deliveryLat},${o.deliveryLng}`} target="_blank" rel="noreferrer">Open directions ↗</a></dd></>)}
                </dl>
              )}
              <dl className="kv mt-s">
                <dt>Payment</dt><dd>{o.paymentMethod === 'momo' ? 'Mobile Money' : 'Cash'} on {o.method === 'delivery' ? 'delivery' : 'pickup'} · <Badge tone={o.paymentStatus === 'paid' ? 'green' : 'grey'}>{o.paymentStatus}</Badge></dd>
                {o.note && (<><dt>Patient note</dt><dd>{o.note}</dd></>)}
              </dl>
            </div>

            <div>
              <h3>Medicines</h3>
              {o.items.map((i) => (
                <div className="item-line" key={i.medicineId}><span>{i.name} {i.strength} <span className="muted">× {i.quantity}</span></span><span>{money(i.unitPrice * i.quantity)}</span></div>
              ))}
              {o.deliveryFee > 0 && <div className="item-line"><span className="muted">Delivery fee</span><span>{money(o.deliveryFee)}</span></div>}
              <div className="total-line"><span>Total to collect</span><span>{money(o.total)}</span></div>
            </div>

            {o.nextStatuses.length > 0 && (
              <div className="card" style={{ padding: 16, background: 'var(--tint2)' }}>
                <h3>Update order status</h3>
                <p className="muted small mt-s">The patient is notified straight away.</p>
                <div className="mt-s">
                  <Field label="Note to patient (optional, required when declining)">
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={o.status === 'pending' ? 'e.g. Out of stock, try again tomorrow' : 'e.g. Rider is 10 minutes away'} />
                  </Field>
                </div>
                <div className="row wrap mt">
                  {o.nextStatuses.map((s) => {
                    const a = ACTION_LABEL[s];
                    return <Button key={s} variant={a.variant || 'primary'} icon={a.icon} loading={busy === s} disabled={!!busy && busy !== s} onClick={() => move(s)}>{a.label}</Button>;
                  })}
                </div>
                {pharmacy?.approvalStatus !== 'approved' && <p className="small mt-s" style={{ color: 'var(--red)' }}>Your pharmacy must be approved before you can update orders.</p>}
              </div>
            )}

            <div>
              <h3>Timeline</h3>
              <div className="timeline mt-s">
                {o.timeline.map((t, i) => (
                  <div key={i}><span><strong>{t.statusText}</strong>{t.note && <span className="muted"> — {t.note}</span>}<br /><span className="muted small">{fmtDateTime(t.at)}</span></span></div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
