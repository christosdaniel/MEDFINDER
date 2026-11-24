import { useState } from 'react';
import { Badge, Button, Empty, Icon, Spinner, Thumb, fmtDate, imageUrl, timeAgo, useLoad, useToast } from '@medfinder/web-shared';
import { api } from '../api';

export default function Patients() {
  const [q, setQ] = useState('');
  const toast = useToast();
  const { data, loading, reload } = useLoad(() => api.get(`/admin/patients?q=${encodeURIComponent(q)}`), [q]);
  const setStatus = async (p: any, status: string) => {
    if (status === 'suspended' && !confirm(`Suspend ${p.firstName} ${p.lastName}? They will be signed out and cannot order.`)) return;
    try { await api.post(`/admin/patients/${p.id}/status`, { status }); toast(`Patient ${status}`); reload(); } catch (e: any) { toast(e.message, 'err'); }
  };
  return (
    <>
      <div className="search"><Icon name="search" size={18} /><input className="input" placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="card flush">
        {loading && !data ? <Spinner /> : !data.patients.length ? <Empty icon="users" title="No patients found" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Name</th><th>Phone</th><th>Verified</th><th className="num">Orders</th><th>Joined</th><th>Last login</th><th>Status</th><th /></tr></thead>
            <tbody>{data.patients.map((p: any) => (
              <tr key={p.id}>
                <td><span className="row" style={{ gap: 10 }}><Thumb src={imageUrl(p.avatarImageId)} label={p.firstName} size={34} round /><span><strong>{p.firstName} {p.lastName}</strong><div className="muted small">{p.email || ''}</div></span></span></td>
                <td>{p.phone}</td>
                <td>{p.phoneVerified ? <Badge tone="green">Yes</Badge> : <Badge tone="grey">No</Badge>}</td>
                <td className="num">{p.ordersCount}</td>
                <td className="muted small">{fmtDate(p.createdAt)}</td>
                <td className="muted small">{timeAgo(p.lastLoginAt)}</td>
                <td><Badge>{p.status}</Badge></td>
                <td>{p.status === 'active'
                  ? <Button variant="ghost" small onClick={() => setStatus(p, 'suspended')}>Suspend</Button>
                  : <Button variant="ghost" small onClick={() => setStatus(p, 'active')}>Reactivate</Button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
