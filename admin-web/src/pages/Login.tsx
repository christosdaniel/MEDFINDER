import { useState, type FormEvent } from 'react';
import { Button, Field, Icon } from '@medfinder/web-shared';
import { api } from '../api';
import { useAuth } from '../auth';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { const r = await api.post('/admin/auth/login', { email, password }); signIn(r.token, r.admin); }
    catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="auth">
      <aside className="auth-aside">
        <div className="logo-box"><img src={`${import.meta.env.BASE_URL}logo.png`} alt="MedFinder" /></div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1>MedFinder admin console</h1>
          <p>Verify pharmacies, keep listings accurate, handle complaints and control features across the patient app and pharmacy portal.</p>
          <div className="auth-points">
            <div><span><Icon name="shield" size={18} /></span> Approve and monitor pharmacies</div>
            <div><span><Icon name="flag" size={18} /></span> Resolve patient complaints</div>
            <div><span><Icon name="megaphone" size={18} /></span> Roll out features and announcements</div>
          </div>
        </div>
        <p className="small" style={{ position: 'relative', zIndex: 1 }}>Authorised staff only</p>
      </aside>
      <main className="auth-main">
        <div className="auth-card" style={{ maxWidth: 400 }}>
          <div><h1>Admin sign in</h1><p className="muted mt-s">Use your MedFinder staff account.</p></div>
          <form onSubmit={submit}>
            {error && <div className="error-box">{error}</div>}
            <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></Field>
            <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></Field>
            <Button type="submit" loading={busy} className="btn-block">Sign in</Button>
          </form>
        </div>
      </main>
    </div>
  );
}
