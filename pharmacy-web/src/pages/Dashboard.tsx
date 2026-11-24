import { useNavigate } from 'react-router-dom';
import { Badge, Bars, Empty, Icon, Spinner, Stat, money, timeAgo, useLoad } from '@medfinder/web-shared';
import { api, type Order } from '../api';
import { useAuth } from '../auth';

export default function Dashboard() {
  const { pharmacy } = useAuth();
  const nav = useNavigate();
  const { data, loading, error } = useLoad(() => api.get('/pharmacy/dashboard'));
  if (loading && !data) return <Spinner />;
  if (error) return <div className="error-box">{error}</div>;
  const s = data.stats;
  return (
    <>
      <div className="row-between">
        <div>
          <h2>Akwaaba, {pharmacy?.ownerName?.split(' ')[0] || pharmacy?.name} 👋</h2>
          <p className="muted">Here's what's happening at {pharmacy?.name} today.</p>
        </div>
        <div className="row">
          <button className="btn btn-secondary" onClick={() => nav('/stock/import')}><Icon name="upload" size={18} /> Update stock</button>
          <button className="btn btn-primary" onClick={() => nav('/orders')}><Icon name="bag" size={18} /> View orders</button>
        </div>
      </div>
      <div className="grid-4">
        <Stat label="New orders waiting" value={s.pendingOrders} icon="bell" tone={s.pendingOrders ? 'amber' : 'green'} sub={`${s.activeOrders} in progress`} />
        <Stat label="Orders today" value={s.ordersToday} icon="bag" sub={money(s.revenueToday)} />
        <Stat label="Completed this month" value={money(s.monthRevenue)} icon="chart" tone="blue" />
        <Stat label="Medicines listed" value={s.stockItems} icon="box" tone={s.lowStockCount ? 'red' : 'green'} sub={`${s.lowStockCount} low or out of stock`} />
      </div>
      <div className="grid-2" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <div className="card flush">
          <div className="card-head"><h3>Recent orders</h3><button className="btn btn-ghost btn-sm" onClick={() => nav('/orders')}>See all</button></div>
          {data.recentOrders.length === 0 ? (
            <Empty icon="bag" title="No orders yet" text="When patients order from you, they'll show up here." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Order</th><th>Patient</th><th>Method</th><th className="num">Total</th><th>Status</th></tr></thead>
                <tbody>
                  {data.recentOrders.map((o: Order) => (
                    <tr key={o.id} className="clickable" onClick={() => nav(`/orders/${o.id}`)}>
                      <td><strong>{o.code}</strong><div className="muted small">{timeAgo(o.createdAt)}</div></td>
                      <td>{o.patient.name}</td>
                      <td style={{ textTransform: 'capitalize' }}>{o.method}</td>
                      <td className="num">{money(o.total)}</td>
                      <td><Badge>{o.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>Low stock</h3><button className="btn btn-ghost btn-sm" onClick={() => nav('/stock')}>Manage</button></div>
            {data.lowStock.length === 0 ? <p className="muted small">Everything is well stocked. 👍</p> : (
              <div className="list">
                {data.lowStock.map((l: any) => (
                  <div className="list-item" key={l.id}>
                    <span className="avatar">{l.name[0]}</span>
                    <div className="grow"><strong>{l.name}</strong> <span className="muted small">{l.strength}</span></div>
                    <Badge>{l.quantity === 0 ? 'Out of stock' : 'Low stock'}</Badge>
                    <span className="muted small" style={{ width: 44, textAlign: 'right' }}>{l.quantity} left</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card">
            <h3>Orders this week</h3>
            <Bars data={data.week} valueKey="orders" labelKey="day" />
          </div>
          {data.demandedMedicines.length > 0 && (
            <div className="card">
              <h3>Patients are looking for</h3>
              <p className="muted small mt-s">Medicines patients asked to be alerted about because no pharmacy had them.</p>
              <div className="list mt-s">
                {data.demandedMedicines.map((d: any) => (
                  <div className="list-item" key={d.name + d.strength}><Icon name="pill" size={18} /><span className="grow">{d.name} {d.strength}</span><span className="muted small">{d.patients} waiting</span></div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
