import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Empty, Field, Icon, Modal, PhotoPicker, PhotoSuggestions, Spinner, Thumb, imageUrl, money, timeAgo, useLoad, useToast } from '@medfinder/web-shared';
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
  const uploadPhoto = async (item: InventoryItem, file?: File | null) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    try {
      const r = await api.post(`/pharmacy/inventory/${item.id}/image`, fd);
      setData((d) => d && { items: d.items.map((i) => (i.id === item.id ? r.item : i)) });
      toast(`Photo added to ${item.name}`);
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
        Patients see these prices, stock levels and photos. Last updated {timeAgo(pharmacy?.lastSyncAt)}. Change price or quantity directly in the table and press Enter. Click a picture to add a photo of the pack you sell.
      </p>
      <div className="card flush">
        {loading && !data ? <Spinner /> : !data?.items.length ? (
          <Empty icon="box" title={q || filter ? 'No matching medicines' : 'Your stock list is empty'}
            text={q || filter ? 'Try a different search.' : 'Add medicines one by one, or import your Excel / Access stock file.'}
            action={!q && !filter && <div className="row mt-s"><Button variant="secondary" icon="upload" onClick={() => nav('/stock/import')}>Import file</Button><Button icon="plus" onClick={() => setEditing('new')}>Add medicine</Button></div>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th style={{ width: 64 }}>Photo</th><th>Medicine</th><th>Category</th><th>Price (GH₵)</th><th>Quantity</th><th>Status</th><th>Updated</th><th /></tr></thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <label title={i.imageId ? 'Change photo' : 'Add a photo of this medicine'} style={{ cursor: 'pointer', display: 'inline-block', position: 'relative' }}>
                        <Thumb src={imageUrl(i.imageId ?? i.catalogueImageId)} label={i.name} size={44} />
                        {!i.imageId && <span style={{ position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: '50%', background: 'var(--green2)', color: '#fff', display: 'grid', placeItems: 'center', border: '2px solid #fff' }}><Icon name="plus" size={12} /></span>}
                        <input type="file" accept="image/*" hidden onChange={(e) => { uploadPhoto(i, e.target.files?.[0]); e.target.value = ''; }} />
                      </label>
                    </td>
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
      {editing && <ItemModal item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} onChanged={reload} />}
    </>
  );
}

function InlineNumber({ value, step, onSave }: { value: number; step: string; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  const commit = () => { const n = Number(v); if (v !== String(value) && Number.isFinite(n) && n >= 0) onSave(n); else setV(String(value)); };
  return <input className="input" type="number" min="0" step={step} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />;
}

function ItemModal({ item, onClose, onSaved, onChanged }: { item: InventoryItem | null; onClose: () => void; onSaved: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState<InventoryItem | null>(item);
  const [newPhoto, setNewPhoto] = useState<File | null>(null);
  const [f, setF] = useState<any>(item ?? { name: '', strength: '', form: '', category: '', price: '', quantity: '', lowStockThreshold: 10, requiresPrescription: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    setBusy(true); setError('');
    try {
      if (item) await api.patch(`/pharmacy/inventory/${item.id}`, { price: f.price, quantity: f.quantity, lowStockThreshold: f.lowStockThreshold, sku: f.sku || undefined });
      else {
        const r = await api.post('/pharmacy/inventory', f);
        if (newPhoto) {
          const fd = new FormData(); fd.append('image', newPhoto);
          await api.post(`/pharmacy/inventory/${r.item.id}/image`, fd).catch((e) => toast(`Saved, but the photo failed: ${e.message}`, 'err'));
        }
      }
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
        <Field label="Photo of the medicine" hint="Show patients the exact pack you sell. Clear photo on a plain background.">
          {current ? (
            <PhotoPicker
              src={imageUrl(current.imageId ?? current.catalogueImageId)}
              label={current.name}
              size={88}
              hint={!current.imageId && current.catalogueImageId
                ? (current.catalogueImageCredit ? `Added automatically. ${current.catalogueImageCredit}. Upload your own pack photo if it looks different.` : 'Showing the default MedFinder photo. Upload your own pack photo.')
                : undefined}
              onUpload={async (file) => { const fd = new FormData(); fd.append('image', file); const r = await api.post(`/pharmacy/inventory/${current.id}/image`, fd); setCurrent(r.item); onChanged(); }}
              onRemove={current.imageId ? async () => { const r = await api.del(`/pharmacy/inventory/${current.id}/image`); setCurrent(r.item); onChanged(); } : undefined}
            />
          ) : null}
          {current && (
            <div className="mt-s">
              <PhotoSuggestions
                load={() => api.get(`/pharmacy/inventory/${current.id}/photo-suggestions`)}
                onPick={async (sug) => { const r = await api.post(`/pharmacy/inventory/${current.id}/photo-from-suggestion`, sug); setCurrent(r.item); onChanged(); toast('Photo added'); }}
              />
            </div>
          )}
          {!current && (
            <div className="row">
              {newPhoto && <img src={URL.createObjectURL(newPhoto)} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--line)' }} />}
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                <Icon name="upload" size={16} /> {newPhoto ? 'Choose another photo' : 'Choose photo (optional)'}
                <input type="file" accept="image/*" hidden onChange={(e) => setNewPhoto(e.target.files?.[0] || null)} />
              </label>
              {!newPhoto && <span className="muted small">No photo? We'll look for a free one automatically.</span>}
            </div>
          )}
        </Field>
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
