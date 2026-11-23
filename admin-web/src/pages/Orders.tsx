import { useState } from 'react';
import { Badge, Empty, Spinner, money, timeAgo, useLoad } from '@medfinder/web-shared';
import { api } from '../api';

const STATUSES = ['', 'pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled', 'rejected'];

export default function Orders() {
  const [status, setStatus] = useState('');
  const { data, loading } = useLoad(() => api.get(`/admin/orders?status=${status}`), [status]);
  return (
    <>
      <div className="row"><select className="input" style={{ width: 220 }} value={status} onChange={(e) => setStatus(e.target.value)}>
        {STATUSES.map((s) => <option key={s} value={s}>{s ? s.replace(/_/g, ' ') : 'All statuses'}</option>)}
      </select></div>
      <div className="card flush">
        {loading && !data ? <Spinner /> : !data.orders.length ? <Empty icon="bag" title="No orders" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Order</th><th>Patient</th><th>Pharmacy</th><th>Items</th><th>Method</th><th className="num">Total</th><th>Status</th></tr></thead>
            <tbody>{data.orders.map((o: any) => (
              <tr key={o.id}>
                <td><strong>{o.code}</strong><div className="muted small">{timeAgo(o.createdAt)}</div></td>
                <td>{o.patient.name}<div className="muted small">{o.patient.phone}</div></td>
                <td>{o.pharmacy.name}</td>
                <td className="small">{o.items.map((i: any) => `${i.name} ×${i.quantity}`).join(', ')}</td>
                <td style={{ textTransform: 'capitalize' }}>{o.method}</td>
                <td className="num">{money(o.total)}</td>
                <td><Badge>{o.status}</Badge></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
