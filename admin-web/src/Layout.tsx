import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icon, Logo, NotificationBell, timeAgo } from '@medfinder/web-shared';
import { api } from './api';
import { useAuth } from './auth';

const TITLES: Record<string, string> = {
  '/': 'Overview', '/pharmacies': 'Pharmacies', '/patients': 'Patients', '/orders': 'Orders', '/complaints': 'Complaints',
  '/app-control': 'App control: features & announcements', '/medicines': 'Medicine catalogue', '/settings': 'Settings & admins',
};

export default function Layout() {
  const { admin, signOut } = useAuth();
  const [menu, setMenu] = useState(false);
  const [counts, setCounts] = useState({ pending: 0, complaints: 0 });
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => setMenu(false), [loc.pathname]);
  useEffect(() => {
    const load = () => api.get('/admin/stats').then((s) => setCounts({ pending: s.pendingPharmacies, complaints: s.openComplaints })).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [loc.pathname]);
  const loadNotifs = useCallback(() => api.get('/admin/notifications'), []);
  const markRead = useCallback(() => api.post('/admin/notifications/read'), []);

  const link = (to: string, icon: string, label: string, count?: number) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
      <Icon name={icon} /> {label} {count ? <span className="count">{count}</span> : null}
    </NavLink>
  );
  const title = TITLES[loc.pathname] || (loc.pathname.startsWith('/pharmacies') ? 'Pharmacies' : 'Admin');

  return (
    <div className="layout">
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <Logo subtitle="Admin console" />
        <nav>
          {link('/', 'chart', 'Overview')}
          {link('/pharmacies', 'shield', 'Pharmacies', counts.pending)}
          {link('/patients', 'users', 'Patients')}
          {link('/orders', 'bag', 'Orders')}
          {link('/complaints', 'flag', 'Complaints', counts.complaints)}
          {link('/app-control', 'megaphone', 'App control')}
          {link('/medicines', 'pill', 'Medicines')}
          {link('/settings', 'settings', 'Settings')}
        </nav>
        <div className="sidebar-foot">
          <div className="row"><span className="avatar">{admin?.name[0]}</span><div><strong style={{ fontSize: 14 }}>{admin?.name}</strong><p className="muted small">{admin?.email}</p></div></div>
          <button className="nav-link" style={{ border: 0, background: 'none' }} onClick={signOut}><Icon name="logout" /> Sign out</button>
        </div>
      </aside>
      {menu && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.2)', zIndex: 55 }} onClick={() => setMenu(false)} />}
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMenu(true)} aria-label="Menu"><Icon name="menu" /></button>
          <h1 className="grow">{title}</h1>
          <NotificationBell load={loadNotifs} markRead={markRead} timeAgo={timeAgo} onOpenItem={(n) => n.data?.pharmacyId && nav(`/pharmacies/${n.data.pharmacyId}`)} />
        </header>
        <div className="content"><Outlet /></div>
      </div>
    </div>
  );
}
