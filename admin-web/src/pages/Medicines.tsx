import { useState } from 'react';
import { Button, Empty, Field, Icon, Modal, PhotoPicker, Spinner, Thumb, imageUrl, useLoad, useToast } from '@medfinder/web-shared';
import { api } from '../api';

export default function Medicines() {
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<any>(null);
  const { data, loading, reload } = useLoad(() => api.get(`/admin/medicines?q=${encodeURIComponent(q)}`), [q]);
  return (
    <>
      <div className="row-between">
        <div className="search"><Icon name="search" size={18} /><input className="input" placeholder="Search catalogue…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <p className="muted small">The catalogue grows automatically as pharmacies add stock. Tidy names and categories here.</p>
      </div>
      <div className="card flush">
        {loading && !data ? <Spinner /> : !data.medicines.length ? <Empty icon="pill" title="No medicines" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th style={{ width: 56 }}>Photo</th><th>Name</th><th>Strength</th><th>Form</th><th>Category</th><th>Rx</th><th className="num">Pharmacies listing</th><th /></tr></thead>
            <tbody>{data.medicines.map((m: any) => (
              <tr key={m.id}>
                <td><Thumb src={imageUrl(m.imageId)} label={m.name} size={36} /></td>
                <td><strong>{m.name}</strong></td><td>{m.strength}</td><td className="muted">{m.form || '—'}</td><td className="muted">{m.category || '—'}</td>
                <td>{m.requiresPrescription ? 'Yes' : '—'}</td><td className="num">{m.listings}</td>
                <td><button className="icon-btn" onClick={() => setEdit(m)}><Icon name="edit" size={18} /></button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {edit && <EditMedicine m={edit} onClose={() => { setEdit(null); reload(); }} onDone={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function EditMedicine({ m, onClose, onDone }: { m: any; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ ...m });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    try { await api.patch(`/admin/medicines/${m.id}`, { name: f.name, strength: f.strength, form: f.form || undefined, category: f.category || undefined, description: f.description || undefined, requiresPrescription: f.requiresPrescription }); toast('Saved'); onDone(); }
    catch (e: any) { toast(e.message, 'err'); }
  };
  return (
    <Modal title={`Edit ${m.name}`} onClose={onClose}>
      <div className="stack">
        <Field label="Default photo" hint="Shown to patients wherever a pharmacy hasn't added its own photo of this medicine.">
          <PhotoPicker src={imageUrl(f.imageId)} label={m.name} size={88}
            onUpload={async (file) => { const fd = new FormData(); fd.append('image', file); const r = await api.post(`/admin/medicines/${m.id}/image`, fd); setF({ ...f, imageId: r.imageId }); toast('Photo updated'); }} />
        </Field>
        <div className="grid-2">
          <Field label="Name"><input value={f.name} onChange={set('name')} /></Field>
          <Field label="Strength"><input value={f.strength} onChange={set('strength')} /></Field>
          <Field label="Form"><input value={f.form || ''} onChange={set('form')} /></Field>
          <Field label="Category"><input value={f.category || ''} onChange={set('category')} /></Field>
        </div>
        <Field label="Description (shown to patients)"><textarea value={f.description || ''} onChange={set('description')} /></Field>
        <label className="check"><input type="checkbox" checked={f.requiresPrescription} onChange={set('requiresPrescription')} /> Prescription only</label>
        <Button onClick={save}>Save</Button>
      </div>
    </Modal>
  );
}
