import { useNavigate } from 'react-router-dom';
import { Bars, Spinner, Stat, money, useLoad } from '@medfinder/web-shared';
import { api } from '../api';

export default function Overview() {
  const nav = useNavigate();
  const { data: s, loading, error } = useLoad(() => api.get('/admin/stats'));
  if (loading && !s) return <Spinner />;
  if (error) return <div className="error-box">{error}</div>;
  return (
    <>
      {s.pendingPharmacies > 0 && (
        <div className="banner amber">
          <strong className="grow">{s.pendingPharmacies} pharmacy request{s.pendingPharmacies > 1 ? 's' : ''} waiting for review</strong>
          <button className="btn btn-secondary btn-sm" onClick={() => nav('/pharmacies')}>Review now</button>
        </div>
      )}
      <div className="grid-4">
        <Stat label="Patients" value={s.patients} icon="users" />
        <Stat label="Live pharmacies" value={s.pharmacies} icon="shield" tone="blue" sub={`${s.pendingPharmacies} pending approval`} />
        <Stat label="Orders today" value={s.ordersToday} icon="bag" sub={`${s.ordersTotal} all time`} />
        <Stat label="Open complaints" value={s.openComplaints} icon="flag" tone={s.openComplaints ? 'red' : 'green'} />
        <Stat label="Completed order value" value={money(s.gmv)} icon="chart" tone="blue" />
        <Stat label="Subscription revenue" value={money(s.subscriptionRevenue)} icon="card" />
        <Stat label="Medicines in catalogue" value={s.medicines} icon="pill" />
        <Stat label="Stale listings" value={s.staleListings} icon="clock" tone={s.staleListings ? 'amber' : 'green'} sub="No stock update in 7 days" />
      </div>
      <div className="grid-3" style={{ gridTemplateColumns: '1.4fr 1fr 1fr' }}>
        <div className="card"><h3>Orders, last 14 days</h3><Bars data={s.ordersByDay} valueKey="orders" labelKey="day" /></div>
        <div className="card">
          <h3>Top searches</h3>
          <div className="list mt-s">{s.topSearches.length ? s.topSearches.map((t: any) => (
            <div className="list-item" key={t.query}><span className="grow">{t.query}</span><span className="muted small">{t.n}</span></div>
          )) : <p className="muted small">No searches yet.</p>}</div>
        </div>
        <div className="card">
          <h3>Unmet demand</h3>
          <p className="muted small">Patients waiting for a restock alert.</p>
          <div className="list mt-s">{s.unmetDemand.length ? s.unmetDemand.map((t: any) => (
            <div className="list-item" key={t.name + t.strength}><span className="grow">{t.name} {t.strength}</span><span className="muted small">{t.patients}</span></div>
          )) : <p className="muted small">Nothing outstanding.</p>}</div>
        </div>
      </div>
    </>
  );
}
