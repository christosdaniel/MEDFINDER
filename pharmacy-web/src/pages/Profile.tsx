import { useState, type FormEvent } from 'react';
import { Badge, Button, Field, PhotoPicker, fmtDate, imageUrl, useToast, PasswordInput } from '@medfinder/web-shared';
import { api } from '../api';
import { useAuth } from '../auth';
import LocationPicker from '../components/LocationPicker';

export default function Profile() {
  const { pharmacy, setPharmacy } = useAuth();
  const toast = useToast();
  const [f, setF] = useState<any>({ ...pharmacy });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!pharmacy) return null;
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    const fields = ['name', 'ownerName', 'phone', 'whatsapp', 'licenseNumber', 'address', 'area', 'city', 'region', 'lat', 'lng', 'bio', 'openingHours', 'offersDelivery', 'deliveryFee', 'deliveryRadiusKm'];
    const body: any = {};
    for (const k of fields) if (f[k] !== null && f[k] !== undefined && f[k] !== '') body[k] = f[k];
    try {
      const r = await api.patch('/pharmacy/me', body);
      setPharmacy(r.pharmacy);
      toast(r.reReview ? 'Saved. Your name/licence change will be reviewed by MedFinder.' : 'Profile saved');
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <form className="stack" onSubmit={save}>
      {error && <div className="error-box">{error}</div>}
      <div className="card">
        <h3>Profile picture</h3>
        <p className="muted small mt-s">Your logo or a photo of your shopfront. Patients see it in search results and on your pharmacy page, so they can recognise you.</p>
        <div className="mt">
          <PhotoPicker
            src={imageUrl(pharmacy.logoImageId)}
            label={pharmacy.name}
            size={112}
            hint="Square pictures work best. JPG or PNG, up to 10 MB."
            onUpload={async (file) => { const fd = new FormData(); fd.append('image', file); const r = await api.post('/pharmacy/me/logo', fd); setPharmacy(r.pharmacy); toast('Profile picture updated'); }}
            onRemove={async () => { const r = await api.del('/pharmacy/me/logo'); setPharmacy(r.pharmacy); }}
          />
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Pharmacy details</h3><div className="row"><Badge>{pharmacy.approvalStatus}</Badge><span className="muted small">Joined {fmtDate(pharmacy.createdAt)}</span></div></div>
        <div className="grid-2">
          <Field label="Pharmacy name" hint="Changing this sends your listing for re-approval"><input value={f.name || ''} onChange={set('name')} /></Field>
          <Field label="Owner / superintendent"><input value={f.ownerName || ''} onChange={set('ownerName')} /></Field>
          <Field label="Licence number" hint="Changing this sends your listing for re-approval"><input value={f.licenseNumber || ''} onChange={set('licenseNumber')} /></Field>
          <Field label="Login email"><input value={pharmacy.email} disabled /></Field>
          <Field label="Phone"><input value={f.phone || ''} onChange={set('phone')} /></Field>
          <Field label="WhatsApp"><input value={f.whatsapp || ''} onChange={set('whatsapp')} /></Field>
          <div className="span-2"><Field label="About the pharmacy" hint="Patients see this on your page"><textarea value={f.bio || ''} onChange={set('bio')} /></Field></div>
          <div className="span-2"><Field label="Opening hours"><input value={f.openingHours || ''} onChange={set('openingHours')} /></Field></div>
        </div>
      </div>
      <div className="card">
        <h3>Location</h3>
        <div className="grid-3 mt">
          <div className="span-2"><Field label="Street address"><input value={f.address || ''} onChange={set('address')} /></Field></div>
          <Field label="Area"><input value={f.area || ''} onChange={set('area')} /></Field>
          <Field label="City"><input value={f.city || ''} onChange={set('city')} /></Field>
          <Field label="Region"><input value={f.region || ''} onChange={set('region')} /></Field>
        </div>
        <div className="mt"><LocationPicker lat={f.lat} lng={f.lng} onChange={(lat, lng) => setF({ ...f, lat, lng })} /></div>
      </div>
      <div className="card">
        <h3>Delivery</h3>
        <label className="check mt"><input type="checkbox" checked={!!f.offersDelivery} onChange={set('offersDelivery')} /> We offer home delivery</label>
        {f.offersDelivery && (
          <div className="grid-2 mt">
            <Field label="Delivery fee (GH₵)"><input type="number" min="0" value={f.deliveryFee} onChange={set('deliveryFee')} /></Field>
            <Field label="Delivery radius (km)"><input type="number" min="0" value={f.deliveryRadiusKm} onChange={set('deliveryRadiusKm')} /></Field>
          </div>
        )}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}><Button type="submit" loading={busy}>Save profile</Button></div>
      <ChangePassword />
    </form>
  );
}

function ChangePassword() {
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.post('/pharmacy/me/password', { currentPassword: cur, newPassword: nw }); toast('Password changed'); setCur(''); setNw(''); }
    catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="card">
      <h3>Change password</h3>
      <div className="grid-3 mt" style={{ alignItems: 'end' }}>
        <Field label="Current password"><PasswordInput value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
        <Field label="New password" hint="At least 8 characters"><PasswordInput value={nw} onChange={(e) => setNw(e.target.value)} /></Field>
        <Button variant="secondary" onClick={save} loading={busy} disabled={!cur || nw.length < 8}>Update password</Button>
      </div>
    </div>
  );
}
