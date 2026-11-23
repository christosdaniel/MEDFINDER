import { useState, type FormEvent } from 'react';
import { Button, Field, Icon } from '@medfinder/web-shared';
import { api } from '../api';
import { useAuth } from '../auth';
import LocationPicker from '../components/LocationPicker';

const REGIONS = ['Greater Accra', 'Ashanti', 'Western', 'Central', 'Eastern', 'Volta', 'Northern', 'Upper East', 'Upper West', 'Bono', 'Bono East', 'Ahafo', 'Western North', 'Oti', 'Savannah', 'North East'];

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  return (
    <div className="auth">
      <aside className="auth-aside">
        <div className="logo-box"><img src={`${import.meta.env.BASE_URL}logo.png`} alt="MedFinder - Find medicine, save time and stay healthy." /></div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1>Reach patients looking for your medicines.</h1>
          <p>List your pharmacy on MedFinder Ghana. Patients nearby see your stock and prices, and order for pickup or delivery.</p>
          <div className="auth-points">
            <div><span><Icon name="upload" size={18} /></span> Link your Excel or Access stock file in minutes</div>
            <div><span><Icon name="bag" size={18} /></span> Get orders with the patient's contact details</div>
            <div><span><Icon name="pin" size={18} /></span> Appear on the map for patients near you</div>
          </div>
        </div>
        <p className="small" style={{ position: 'relative', zIndex: 1 }}>© MedFinder Ghana</p>
      </aside>
      <main className="auth-main">
        {mode === 'login' ? <Login onSwitch={() => setMode('register')} /> : <Register onSwitch={() => setMode('login')} />}
      </main>
    </div>
  );
}

function Login({ onSwitch }: { onSwitch: () => void }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await api.post('/pharmacy/auth/login', { email, password });
      signIn(r.token, r.pharmacy);
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="auth-card" style={{ maxWidth: 420 }}>
      <div>
        <h1>Pharmacy sign in</h1>
        <p className="muted mt-s">Welcome back. Manage your stock and orders.</p>
      </div>
      <form onSubmit={submit}>
        {error && <div className="error-box">{error}</div>}
        <Field label="Email"><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="Password"><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <Button type="submit" loading={busy} className="btn-block">Sign in</Button>
      </form>
      <p className="auth-switch">New to MedFinder? <button onClick={onSwitch}>Register your pharmacy</button></p>
    </div>
  );
}

type Form = Record<string, any>;

function Register({ onSwitch }: { onSwitch: () => void }) {
  const { signIn } = useAuth();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>({ region: 'Greater Accra', city: 'Accra', offersDelivery: false, deliveryFee: 0, lat: null, lng: null });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const stepFields = [
    ['name', 'ownerName', 'licenseNumber', 'phone', 'email'],
    ['address', 'city'],
    ['password', 'confirm'],
  ];
  const checkStep = () => {
    const errs: Record<string, string> = {};
    for (const k of stepFields[step]) if (!String(f[k] ?? '').trim()) errs[k] = 'Required';
    if (step === 2) {
      if ((f.password || '').length < 8) errs.password = 'Use at least 8 characters';
      if (f.password !== f.confirm) errs.confirm = 'Passwords do not match';
    }
    setErrors(errs);
    return !Object.keys(errs).length;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!checkStep()) return;
    if (step < 2) { setStep(step + 1); return; }
    setBusy(true); setError('');
    try {
      const { confirm: _c, ...body } = f;
      if (body.lat === null) { delete body.lat; delete body.lng; }
      const r = await api.post('/pharmacy/auth/register', body);
      signIn(r.token, r.pharmacy);
    } catch (err: any) {
      setError(err.message);
      if (err.details) setErrors(err.details);
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-card">
      <div>
        <h1>Register your pharmacy</h1>
        <p className="muted mt-s">Step {step + 1} of 3 · {['Pharmacy details', 'Location & services', 'Create your login'][step]}</p>
      </div>
      <div className="steps">{[0, 1, 2].map((i) => <span key={i} className={i <= step ? 'on' : ''} />)}</div>
      <form onSubmit={submit}>
        {error && <div className="error-box">{error}</div>}
        {step === 0 && (
          <>
            <Field label="Pharmacy name" error={errors.name}><input value={f.name || ''} onChange={set('name')} placeholder="e.g. Adom Pharmacy" /></Field>
            <div className="grid-2">
              <Field label="Owner / superintendent pharmacist" error={errors.ownerName}><input value={f.ownerName || ''} onChange={set('ownerName')} /></Field>
              <Field label="Pharmacy Council licence number" error={errors.licenseNumber}><input value={f.licenseNumber || ''} onChange={set('licenseNumber')} placeholder="PC/GH/..." /></Field>
              <Field label="Phone number" error={errors.phone} hint="Patients will use this to call you"><input value={f.phone || ''} onChange={set('phone')} placeholder="024 123 4567" /></Field>
              <Field label="WhatsApp (optional)" error={errors.whatsapp}><input value={f.whatsapp || ''} onChange={set('whatsapp')} placeholder="024 123 4567" /></Field>
            </div>
            <Field label="Email" error={errors.email} hint="You'll use this to sign in"><input type="email" value={f.email || ''} onChange={set('email')} /></Field>
            <Field label="About your pharmacy (optional)" hint="Shown to patients on your profile"><textarea value={f.bio || ''} onChange={set('bio')} placeholder="Services, specialities, languages spoken..." /></Field>
          </>
        )}
        {step === 1 && (
          <>
            <Field label="Street address" error={errors.address}><input value={f.address || ''} onChange={set('address')} placeholder="e.g. 12 Oxford Street, near Koala" /></Field>
            <div className="grid-3">
              <Field label="Area / suburb"><input value={f.area || ''} onChange={set('area')} placeholder="Osu" /></Field>
              <Field label="City / town" error={errors.city}><input value={f.city || ''} onChange={set('city')} /></Field>
              <Field label="Region"><select value={f.region} onChange={set('region')}>{REGIONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
            </div>
            <Field label="Opening hours"><input value={f.openingHours || ''} onChange={set('openingHours')} placeholder="Mon–Sat 8:00–21:00, Sun 10:00–16:00" /></Field>
            <LocationPicker lat={f.lat} lng={f.lng} onChange={(lat, lng) => setF({ ...f, lat, lng })} />
            <label className="check"><input type="checkbox" checked={f.offersDelivery} onChange={set('offersDelivery')} /> We offer home delivery</label>
            {f.offersDelivery && (
              <div className="grid-2">
                <Field label="Delivery fee (GH₵)"><input type="number" min="0" value={f.deliveryFee} onChange={set('deliveryFee')} /></Field>
                <Field label="Delivery radius (km)"><input type="number" min="0" value={f.deliveryRadiusKm ?? 5} onChange={set('deliveryRadiusKm')} /></Field>
              </div>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <Field label="Password" error={errors.password} hint="At least 8 characters"><input type="password" autoComplete="new-password" value={f.password || ''} onChange={set('password')} /></Field>
            <Field label="Confirm password" error={errors.confirm}><input type="password" autoComplete="new-password" value={f.confirm || ''} onChange={set('confirm')} /></Field>
            <div className="info-box"><Icon name="shield" /><span>After you register, MedFinder checks your licence. Your pharmacy becomes visible to patients once approved. You get a free trial period to start.</span></div>
          </>
        )}
        <div className="row">
          {step > 0 && <Button variant="secondary" onClick={() => setStep(step - 1)} icon="back">Back</Button>}
          <Button type="submit" loading={busy} className="grow">{step < 2 ? 'Continue' : 'Submit for approval'}</Button>
        </div>
      </form>
      <p className="auth-switch">Already registered? <button onClick={onSwitch}>Sign in</button></p>
    </div>
  );
}
