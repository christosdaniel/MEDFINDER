import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Empty, Field, Icon, Modal, Spinner, money, timeAgo, useLoad, useToast } from '@medfinder/web-shared';
import { api, type InventoryItem } from '../api';
import { useAuth } from '../auth';

export default function Stock() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<InventoryItem | 'new' | null>(null);
  const toast = useToast();
  const nav = useNavigate();
  const { pharmacy } = useAuth();
  const { data, loading, reload, setData } = useLoad(
    () => api.get<{ items: InventoryItem[] }>(`/pharmacy/inventory?q=${encodeURIComponent(q)}&filter=${filter}`), [q, filter]);

  const quickSave = async (item: InventoryItem, patch: Partial<InventoryItem>) => {
    try {
      const r = await api.patch(`/pharmacy/inventory/${item.id}`, patch);
      setData((d) => d && { items: d.items.map((i) => (i.id === item.id ? r.item : i)) });
      toast(`${item.name} updated`);
    } catch (e: any) { toast(e.message, 'err'); }
  };
  const remove = async (item: InventoryItem) => {
    if (!confirm(`Remove ${item.name} ${item.strength} from your stock list?`)) return;
    try { await api.del(`/pharmacy/inventory/${item.id}`); toast('Removed'); reload(); } catch (e: any) { toast(e.message, 'err'); }
  };

  return (
    <>
      <div className="row-between">
        <div className="row wrap">
          <div className="search"><Icon name="search" size={18} /><input className="input" placeholder="Search medicines…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="tabs">
            {[['', 'All'], ['low', 'Low stock'], ['out', 'Out of stock']].map(([k, l]) => (
              <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="row">
          <Button variant="secondary" icon="upload" onClick={() => nav('/stock/import')}>Import Excel / Access</Button>
          <Button icon="plus" onClick={() => setEditing('new')}>Add medicine</Button>
        </div>
      </div>
      <p className="muted small">
        Patients see these prices and stock levels. Last updated {timeAgo(pharmacy?.lastSyncAt)}. Change price or quantity directly in the table and press Enter.
      </p>
      <div className="card flush">
        {loading && !data ? <Spinner /> : !data?.items.length ? (
          <Empty icon="box" title={q || filter ? 'No matching medicines' : 'Your stock list is empty'}
            text={q || filter ? 'Try a different search.' : 'Add medicines one by one, or import your Excel / Access stock file.'}
            action={!q && !filter && <div className="row mt-s"><Button variant="secondary" icon="upload" onClick={() => nav('/stock/import')}>Import file</Button><Button icon="plus" onClick={() => setEditing('new')}>Add medicine</Button></div>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Medicine</th><th>Category</th><th>Price (GH₵)</th><th>Quantity</th><th>Status</th><th>Updated</th><th /></tr></thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id}>
                    <td><strong>{i.name}</strong> <span className="muted">{i.strength}</span>{i.requiresPrescription && <span className="badge badge-blue" style={{ marginLeft: 6 }}>Rx</span>}<div className="muted small">{i.form}</div></td>
                    <td className="muted">{i.category || '—'}</td>
                    <td><InlineNumber key={`p${i.id}-${i.price}`} value={i.price} step="0.5" onSave={(v) => quickSave(i, { price: v })} /></td>
                    <td><InlineNumber key={`q${i.id}-${i.quantity}`} value={i.quantity} step="1" onSave={(v) => quickSave(i, { quantity: v })} /></td>
                    <td><Badge>{i.stock}</Badge></td>
                    <td className="muted small">{timeAgo(i.updatedAt)}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="icon-btn" title="Edit" onClick={() => setEditing(i)}><Icon name="edit" size={18} /></button>
                        <button className="icon-btn" title="Remove" onClick={() => remove(i)}><Icon name="trash" size={18} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && <ItemModal item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function InlineNumber({ value, step, onSave }: { value: number; step: string; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  const commit = () => { const n = Number(v); if (v !== String(value) && Number.isFinite(n) && n >= 0) onSave(n); else setV(String(value)); };
  return <input className="input" type="number" min="0" step={step} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />;
}

function ItemModal({ item, onClose, onSaved }: { item: InventoryItem | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<any>(item ?? { name: '', strength: '', form: '', category: '', price: '', quantity: '', lowStockThreshold: 10, requiresPrescription: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    setBusy(true); setError('');
    try {
      if (item) await api.patch(`/pharmacy/inventory/${item.id}`, { price: f.price, quantity: f.quantity, lowStockThreshold: f.lowStockThreshold, sku: f.sku || undefined });
      else await api.post('/pharmacy/inventory', f);
      toast(item ? 'Saved' : `${f.name} added to your stock`);
      onSaved();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={item ? `Edit ${item.name} ${item.strength}` : 'Add a medicine'} onClose={onClose}>
      <div className="stack">
        {error && <div className="error-box">{error}</div>}
        {!item && (
          <>
            <div className="grid-2">
              <Field label="Medicine name"><input value={f.name} onChange={set('name')} placeholder="Paracetamol" autoFocus /></Field>
              <Field label="Strength / pack"><input value={f.strength} onChange={set('strength')} placeholder="500mg" /></Field>
              <Field label="Form"><input value={f.form} onChange={set('form')} placeholder="Tablets, syrup…" list="forms" /></Field>
              <Field label="Category"><input value={f.category} onChange={set('category')} placeholder="Pain & fever" /></Field>
            </div>
            <datalist id="forms">{['Tablets', 'Capsules', 'Syrup', 'Suspension', 'Injection', 'Cream', 'Inhaler', 'Drops', 'Sachets'].map((x) => <option key={x} value={x} />)}</datalist>
            <label className="check"><input type="checkbox" checked={f.requiresPrescription} onChange={set('requiresPrescription')} /> Prescription only</label>
          </>
        )}
        <div className="grid-3">
          <Field label="Price (GH₵)"><input type="number" min="0" step="0.5" value={f.price} onChange={set('price')} /></Field>
          <Field label="Quantity in stock"><input type="number" min="0" value={f.quantity} onChange={set('quantity')} /></Field>
          <Field label="Low-stock alert at"><input type="number" min="0" value={f.lowStockThreshold} onChange={set('lowStockThreshold')} /></Field>
        </div>
        {item && <p className="muted small">Current: {money(item.price)} · {item.quantity} in stock</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={busy}>{item ? 'Save changes' : 'Add medicine'}</Button>
        </div>
      </div>
    </Modal>
  );
}
