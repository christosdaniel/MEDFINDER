import { useEffect, useState } from 'react';
import { Button, Empty, Field, Icon, Modal, PhotoPicker, PhotoSuggestions, Spinner, Thumb, imageUrl, useLoad, useToast } from '@medfinder/web-shared';
import { api } from '../api';

export default function Medicines() {
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<any>(null);
  const { data, loading, reload } = useLoad(() => api.get(`/admin/medicines?q=${encodeURIComponent(q)}`), [q]);
  return (
    <>
      <PhotoFill onDone={reload} />
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
          <PhotoPicker src={imageUrl(f.imageId)} label={m.name} size={88} hint={f.imageCredit || undefined}
            onUpload={async (file) => { const fd = new FormData(); fd.append('image', file); const r = await api.post(`/admin/medicines/${m.id}/image`, fd); setF({ ...f, imageId: r.imageId, imageCredit: null }); toast('Photo updated'); }} />
          <div className="mt-s">
            <PhotoSuggestions
              load={() => api.get(`/admin/medicines/${m.id}/photo-suggestions`)}
              onPick={async (sug) => { const r = await api.post(`/admin/medicines/${m.id}/photo-from-suggestion`, sug); setF({ ...f, imageId: r.imageId, imageCredit: `Photo: ${sug.credit}` }); toast('Photo updated'); }}
            />
          </div>
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

/** Shows how many medicines lack a photo and fills them from Wikimedia Commons in the background. */
function PhotoFill({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const { data, reload } = useLoad(() => api.get('/admin/medicines/photo-status'));
  const busy = data && (data.running || data.queued > 0);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => { reload(); onDone(); }, 5000);
    return () => clearInterval(t);
  }, [busy, reload, onDone]);
  if (!data) return null;
  const start = async () => {
    try { const r = await api.post('/admin/medicines/fill-photos'); toast(r.queued ? `Looking for photos for ${r.queued} medicines…` : 'Nothing to look up right now'); reload(); }
    catch (e: any) { toast(e.message, 'err'); }
  };
  return (
    <div className="card row-between">
      <div>
        <h3>Medicine photos</h3>
        <p className="muted small">
          {data.missing ? `${data.missing} medicines have no photo yet.` : 'Every medicine has a photo.'}
          {' '}New medicines get a free photo from Wikimedia Commons automatically when one matches.
          {busy && ` Working… ${data.queued} left, ${data.found} found so far.`}
          {data.lastError && !busy && ` Last problem: ${data.lastError}`}
        </p>
      </div>
      <Button icon="search" onClick={start} loading={!!busy} disabled={!data.missing}>Fill missing photos</Button>
    </div>
  );
}
