import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Badge, Icon, Logo, NotificationBell, timeAgo } from '@medfinder/web-shared';
import { api } from './api';
import { useAuth } from './auth';

const TITLES: Record<string, string> = {
  '/': 'Dashboard', '/orders': 'Orders', '/stock': 'Stock & prices', '/stock/import': 'Import & link your database',
  '/subscription': 'Subscription', '/profile': 'Pharmacy profile',
};

export default function Layout() {
  const { pharmacy, signOut, refresh, announcements } = useAuth();
  const [menu, setMenu] = useState(false);
  const [pending, setPending] = useState(0);
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => setMenu(false), [loc.pathname]);
  useEffect(() => {
    const load = () => api.get('/pharmacy/orders?status=pending').then((r) => setPending(r.orders.length)).catch(() => {});
    load();
    const t = setInterval(() => { load(); refresh(); }, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  const loadNotifs = useCallback(() => api.get('/pharmacy/notifications'), []);
  const markRead = useCallback(() => api.post('/pharmacy/notifications/read'), []);
  if (!pharmacy) return null;
  const title = TITLES[loc.pathname] || (loc.pathname.startsWith('/orders') ? 'Orders' : 'MedFinder');

  const link = (to: string, icon: string, label: string, count?: number) => (
    <NavLink to={to} end={to === '/' || to === '/stock'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
      <Icon name={icon} /> {label} {count ? <span className="count">{count}</span> : null}
    </NavLink>
  );

  return (
    <div className="layout">
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <Logo subtitle="For pharmacies" />
        <nav>
          {link('/', 'chart', 'Dashboard')}
          {link('/orders', 'bag', 'Orders', pending)}
          {link('/stock', 'box', 'Stock & prices')}
          {link('/stock/import', 'upload', 'Import / link database')}
          {link('/subscription', 'card', 'Subscription')}
          {link('/profile', 'settings', 'Pharmacy profile')}
        </nav>
        <div className="sidebar-foot">
          <div className="row">
            <span className="avatar">{pharmacy.name[0]}</span>
            <div style={{ minWidth: 0 }}>
              <strong style={{ display: 'block', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pharmacy.name}</strong>
              <Badge>{pharmacy.approvalStatus}</Badge>
            </div>
          </div>
          <button className="nav-link" style={{ border: 0, background: 'none' }} onClick={signOut}><Icon name="logout" /> Sign out</button>
        </div>
      </aside>
      {menu && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.2)', zIndex: 55 }} onClick={() => setMenu(false)} />}
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMenu(true)} aria-label="Menu"><Icon name="menu" /></button>
          <h1 className="grow">{title}</h1>
          <NotificationBell load={loadNotifs} markRead={markRead} timeAgo={timeAgo}
            onOpenItem={(n) => n.data?.orderId && nav(`/orders/${n.data.orderId}`)} />
        </header>
        <div className="content">
          <StatusBanner />
          {announcements.map((a) => (
            <div key={a.id} className="banner green"><Icon name="megaphone" /><div><strong>{a.title}</strong><p className="small">{a.body}</p></div></div>
          ))}
          <Outlet />
        </div>
      </div>
    </div>
  );
}

function StatusBanner() {
  const { pharmacy } = useAuth();
  const nav = useNavigate();
  if (!pharmacy) return null;
  if (pharmacy.approvalStatus === 'pending') {
    return (
      <div className="banner amber">
        <Icon name="clock" />
        <div className="grow">
          <strong>Your pharmacy is being reviewed</strong>
          <p className="small">The MedFinder team checks your licence and details, usually within 1–2 working days. Meanwhile, add your stock so you're ready to go live.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => nav('/stock/import')}>Add stock</button>
      </div>
    );
  }
  if (pharmacy.approvalStatus === 'rejected' || pharmacy.approvalStatus === 'suspended') {
    return (
      <div className="banner red">
        <Icon name="alert" />
        <div className="grow">
          <strong>{pharmacy.approvalStatus === 'rejected' ? "We couldn't approve your pharmacy" : 'Your listing is suspended'}</strong>
          <p className="small">{pharmacy.rejectionReason || 'Contact MedFinder support for details.'} Patients cannot see your pharmacy until this is fixed.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => nav('/profile')}>Update details</button>
      </div>
    );
  }
  if (pharmacy.subscriptionStatus === 'expired') {
    return (
      <div className="banner red">
        <Icon name="card" />
        <div className="grow"><strong>Your subscription has expired</strong><p className="small">Patients can't see your pharmacy until you renew.</p></div>
        <button className="btn btn-primary btn-sm" onClick={() => nav('/subscription')}>Renew now</button>
      </div>
    );
  }
  return null;
}
