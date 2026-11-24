import { useState } from 'react';
import { Badge, Button, Empty, Field, Icon, Modal, Spinner, fmtDate, money, useLoad, useToast } from '@medfinder/web-shared';
import { api } from '../api';
import { useAuth } from '../auth';

export default function Subscription() {
  const { data, loading, reload } = useLoad(() => api.get('/pharmacy/subscription'));
  const [paying, setPaying] = useState(false);
  if (loading && !data) return <Spinner />;
  const days = data.expiresAt ? Math.ceil((new Date(data.expiresAt.replace(' ', 'T') + 'Z').getTime() - Date.now()) / 86400000) : 0;
  return (
    <>
      <div className="grid-2">
        <div className="card">
          <div className="row-between"><h3>MedFinder Pharmacy plan</h3><Badge>{data.status}</Badge></div>
          <h1 className="mt">{money(data.priceGhs)}<span className="muted" style={{ fontSize: 15, fontWeight: 500 }}> / month</span></h1>
          <p className="muted mt-s">
            {data.status === 'expired' ? 'Your plan has expired. Patients cannot see your pharmacy.' :
              `${data.status === 'trial' ? 'Free trial' : 'Active'} until ${fmtDate(data.expiresAt)} (${Math.max(0, days)} days left).`}
          </p>
          <ul className="small mt" style={{ lineHeight: 1.9, paddingLeft: 18 }}>
            <li>Listed on the MedFinder app for patients nearby</li>
            <li>Unlimited orders, pickup and delivery</li>
            <li>Excel / Access import and automatic stock sync</li>
            <li>Low-stock alerts and demand insights</li>
          </ul>
          <Button className="mt" icon="card" onClick={() => setPaying(true)}>{data.status === 'expired' ? 'Renew now' : 'Pay / extend'}</Button>
        </div>
        <div className="card">
          <h3>Billing details</h3>
          <dl className="kv mt">
            <dt>Status</dt><dd style={{ textTransform: 'capitalize' }}>{data.status}</dd>
            <dt>Renews / expires</dt><dd>{fmtDate(data.expiresAt)}</dd>
            <dt>Payment options</dt><dd>Mobile Money (MTN, Telecel, AT), card or bank transfer</dd>
          </dl>
          <div className="info-box mt"><Icon name="shield" /><span>Payments are confirmed by MedFinder. If you paid by bank transfer, enter the transfer reference.</span></div>
        </div>
      </div>
      <div className="card flush">
        <div className="card-head"><h3>Billing history</h3></div>
        {!data.payments.length ? <Empty icon="card" title="No payments yet" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Period</th><th>Method</th><th>Reference</th><th className="num">Amount</th></tr></thead>
              <tbody>{data.payments.map((p: any) => (
                <tr key={p.id}><td>{fmtDate(p.createdAt)}</td><td>{fmtDate(p.periodStart)} – {fmtDate(p.periodEnd)}</td><td style={{ textTransform: 'uppercase' }}>{p.method}</td><td className="mono">{p.reference}</td><td className="num">{money(p.amount)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      {paying && <PayModal price={data.priceGhs} onClose={() => setPaying(false)} onDone={() => { setPaying(false); reload(); }} />}
    </>
  );
}

function PayModal({ price, onClose, onDone }: { price: number; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { setPharmacy } = useAuth();
  const [months, setMonths] = useState(1);
  const [method, setMethod] = useState('momo');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const pay = async () => {
    setBusy(true);
    try {
      const r = await api.post('/pharmacy/subscription/pay', { months, method, reference: reference || undefined });
      setPharmacy(r.pharmacy);
      toast('Payment recorded. Thank you!');
      onDone();
    } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Modal title="Pay subscription" onClose={onClose}>
      <div className="stack">
        <Field label="How many months?">
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>{[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''} — {money(price * m)}</option>)}</select>
        </Field>
        <Field label="Payment method">
          <select value={method} onChange={(e) => setMethod(e.target.value)}><option value="momo">Mobile Money</option><option value="card">Card</option><option value="bank">Bank transfer</option></select>
        </Field>
        <Field label="Transaction reference" hint="The MoMo transaction ID or bank reference"><input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        <div className="total-line"><span>Total</span><span>{money(price * months)}</span></div>
        <Button onClick={pay} loading={busy} icon="check">Confirm payment</Button>
      </div>
    </Modal>
  );
}
