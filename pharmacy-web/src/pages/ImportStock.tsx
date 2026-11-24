import { useRef, useState } from 'react';
import { Badge, Button, Field, Icon, Spinner, money, timeAgo, useLoad, useToast } from '@medfinder/web-shared';
import { API_URL } from '@medfinder/web-shared';
import { api } from '../api';
import { useAuth } from '../auth';

const FIELD_LABELS: Record<string, string> = {
  name: 'Medicine name *', strength: 'Strength', form: 'Form', category: 'Category', price: 'Price *', quantity: 'Quantity *',
  sku: 'Item code', requires_prescription: 'Prescription only', low_stock_threshold: 'Reorder level',
};

type Preview = {
  format: string; headers: string[]; mapping: Record<string, string>; fields: string[]; table?: string; tables?: string[]; sheet?: string;
  totalRows: number; validRows?: number; items: any[]; errors: string[]; ready: boolean;
};

export default function ImportStock() {
  const { features } = useAuth();
  return (
    <>
      <div className="grid-3" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Step n={1} icon="file" title="Export or pick your stock file" text="Excel (.xlsx), CSV, or a Microsoft Access database (.mdb / .accdb) you already use." />
        <Step n={2} icon="upload" title="Upload and check the columns" text="We detect the medicine, price and quantity columns automatically. Fix any we got wrong." />
        <Step n={3} icon="refresh" title="Keep it in sync" text="Upload again whenever stock changes, or link the file so it syncs on its own." />
      </div>
      {features.stock_import !== false ? <Uploader /> : <div className="warn-box"><Icon name="alert" /> File import is temporarily switched off by MedFinder.</div>}
      {features.sync_agent !== false && <LinkDatabase />}
      <History />
    </>
  );
}

function Step({ n, icon, title, text }: { n: number; icon: string; title: string; text: string }) {
  return (
    <div className="card row" style={{ alignItems: 'flex-start' }}>
      <span className="stat-icon tone-green"><Icon name={icon} /></span>
      <div><p className="muted small">Step {n}</p><h3>{title}</h3><p className="muted small mt-s">{text}</p></div>
    </div>
  );
}

function Uploader() {
  const toast = useToast();
  const { refresh } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [table, setTable] = useState<string>('');
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [busy, setBusy] = useState<'' | 'preview' | 'import'>('');
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const [done, setDone] = useState<any>(null);

  const runPreview = async (f: File, map?: Record<string, string>, tbl?: string) => {
    setBusy('preview'); setError(''); setDone(null);
    const fd = new FormData();
    fd.append('file', f);
    fd.append('dryRun', 'true');
    if (map) fd.append('mapping', JSON.stringify(map));
    if (tbl) fd.append('table', tbl);
    try {
      const r: Preview = await api.post('/pharmacy/inventory/import', fd);
      setPreview(r); setMapping(r.mapping); setTable(r.table || '');
    } catch (e: any) { setError(e.message); setPreview(null); } finally { setBusy(''); }
  };

  const pick = (f?: File | null) => { if (!f) return; setFile(f); runPreview(f); };

  const doImport = async () => {
    if (!file) return;
    if (mode === 'replace' && !confirm('Full stock take: medicines not in this file will be set to 0 (out of stock). Continue?')) return;
    setBusy('import'); setError('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('mode', mode);
    fd.append('mapping', JSON.stringify(mapping));
    if (table) fd.append('table', table);
    try {
      const r = await api.post('/pharmacy/inventory/import', fd);
      setDone(r); setPreview(null); setFile(null);
      toast(`Stock updated: ${r.created} added, ${r.updated} updated`);
      refresh();
    } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  };

  return (
    <div className="card">
      <div className="card-head">
        <div><h3>Upload a stock file</h3><p className="muted small">Columns we look for: Medicine/Drug/Product, Strength, Price/Selling price, Quantity/Qty/Stock.</p></div>
        <Button variant="ghost" icon="download" onClick={() => api.download('/pharmacy/inventory/template', 'medfinder-stock-template.csv')}>Download template</Button>
      </div>

      {!preview && (
        <div className={`dropzone ${over ? 'over' : ''}`} onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
          {busy === 'preview' ? <Spinner label="Reading your file…" /> : (
            <>
              <span className="empty-icon"><Icon name="upload" size={26} /></span>
              <strong>Drop your file here or click to choose</strong>
              <span className="muted small">.xlsx · .csv · .mdb · .accdb — up to 25 MB</span>
            </>
          )}
          <input ref={input} type="file" hidden accept=".xlsx,.xlsm,.csv,.txt,.mdb,.accdb" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      )}
      {error && <div className="error-box mt">{error}</div>}
      {done && (
        <div className="info-box mt"><Icon name="check" />
          <span>Import complete: <strong>{done.created}</strong> new, <strong>{done.updated}</strong> updated{done.zeroed ? <>, <strong>{done.zeroed}</strong> set to out of stock</> : null}.
            {done.errors?.length ? ` ${done.errors.length} rows skipped.` : ''} Patients now see your new stock.</span>
        </div>
      )}

      {preview && file && (
        <div className="stack mt">
          <div className="row-between">
            <div className="row"><Icon name="file" /><strong>{file.name}</strong><Badge tone="grey">{preview.format}</Badge>
              <span className="muted small">{preview.totalRows} rows{preview.sheet ? ` · sheet "${preview.sheet}"` : ''}</span></div>
            <Button variant="ghost" small icon="x" onClick={() => { setPreview(null); setFile(null); }}>Choose another file</Button>
          </div>

          {preview.tables && preview.tables.length > 1 && (
            <Field label="Access table to import" hint="We picked the table that looks most like a stock list.">
              <select value={table} onChange={(e) => { setTable(e.target.value); runPreview(file, undefined, e.target.value); }}>
                {preview.tables.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
          )}

          <div>
            <h3>Match your columns</h3>
            <p className="muted small mt-s">Check that each MedFinder field points at the right column in your file.</p>
            <div className="grid-3 mt-s">
              {preview.fields.map((k) => (
                <Field key={k} label={FIELD_LABELS[k] || k}>
                  <select value={mapping[k] || ''} onChange={(e) => setMapping({ ...mapping, [k]: e.target.value })}>
                    <option value="">— Not in my file —</option>
                    {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </Field>
              ))}
            </div>
            <Button variant="secondary" small className="mt-s" icon="refresh" loading={busy === 'preview'} onClick={() => runPreview(file, mapping, table)}>Re-check with these columns</Button>
          </div>

          {preview.errors.length > 0 && (
            <div className="warn-box"><Icon name="alert" /><div><strong>{preview.errors.length} problem{preview.errors.length > 1 ? 's' : ''}</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{preview.errors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}</ul></div></div>
          )}

          {preview.items.length > 0 && (
            <div className="card flush">
              <div className="card-head"><h3>Preview</h3><span className="muted small">{preview.validRows} medicines ready to import{preview.validRows! > 50 ? ' (showing first 50)' : ''}</span></div>
              <div className="table-wrap" style={{ maxHeight: 340 }}>
                <table className="table">
                  <thead><tr><th>Medicine</th><th>Strength</th><th>Form</th><th className="num">Price</th><th className="num">Quantity</th></tr></thead>
                  <tbody>{preview.items.map((i, idx) => (
                    <tr key={idx}><td>{i.name}</td><td>{i.strength || '—'}</td><td className="muted">{i.form || '—'}</td><td className="num">{money(i.price)}</td><td className="num">{i.quantity}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid-2">
            <label className={`card check ${mode === 'merge' ? '' : 'muted'}`} style={{ alignItems: 'flex-start', borderColor: mode === 'merge' ? 'var(--green2)' : undefined }}>
              <input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} />
              <span><strong>Update listed medicines</strong><br /><span className="small muted">Add new medicines and update prices/quantities for the ones in this file. Others stay as they are.</span></span>
            </label>
            <label className="card check" style={{ alignItems: 'flex-start', borderColor: mode === 'replace' ? 'var(--green2)' : undefined }}>
              <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} />
              <span><strong>Full stock take</strong><br /><span className="small muted">This file is my complete stock. Anything not in it is marked out of stock.</span></span>
            </label>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button icon="upload" onClick={doImport} loading={busy === 'import'} disabled={!preview.ready}>Import {preview.validRows || 0} medicines</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function LinkDatabase() {
  const toast = useToast();
  const { data, reload } = useLoad(() => api.get('/pharmacy/sync-key'));
  const [show, setShow] = useState(false);
  const apiBase = API_URL.startsWith('http') ? API_URL : `${window.location.origin}${API_URL}`;
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast('Copied'));
  const rotate = async () => {
    if (!confirm('Create a new key? The old key stops working and you must update the sync agent.')) return;
    await api.post('/pharmacy/sync-key/rotate'); reload(); toast('New key created');
  };
  const cmd = `node sync.js --api ${apiBase} --key ${show ? data?.syncKey : '<your key>'} --file "C:\\Pharmacy\\stock.xlsx"`;
  return (
    <div className="card">
      <div className="card-head">
        <div><h3><Icon name="link" size={18} /> Link your database (automatic sync)</h3>
          <p className="muted small">Install the MedFinder Stock Sync agent on the computer where your Excel or Access stock file lives. It watches the file and updates MedFinder every time you save.</p></div>
        {data && <span className="muted small">Last sync: {timeAgo(data.lastSyncAt)}</span>}
      </div>
      <div className="stack">
        <Field label="Your sync key" hint="Keep this private. Anyone with it can update your stock.">
          <div className="key-box">
            <code>{data ? (show ? data.syncKey : '•'.repeat(32)) : '…'}</code>
            <Button variant="ghost" small onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</Button>
            <Button variant="secondary" small icon="copy" onClick={() => data && copy(data.syncKey)}>Copy</Button>
            <Button variant="ghost" small icon="refresh" onClick={rotate}>New key</Button>
          </div>
        </Field>
        <div>
          <p className="field-label">How to set it up</p>
          <ol className="small" style={{ lineHeight: 1.7, paddingLeft: 18, margin: '6px 0' }}>
            <li>Install <a href="https://nodejs.org" target="_blank" rel="noreferrer">Node.js</a> (LTS) on the pharmacy computer.</li>
            <li>Get the agent from the MedFinder <code>tools/stock-sync-agent</code> folder (or ask MedFinder support for the installer).</li>
            <li>Open a terminal in that folder, run <code>npm install</code>, then run this command pointing at your stock file (.xlsx, .csv, .mdb or .accdb):</li>
          </ol>
          <div className="code-box">{cmd}</div>
          <p className="muted small mt-s">Add <code>--table Stock</code> for Access databases with several tables, and <code>--mode replace</code> if the file is your full stock list. The agent runs in the background and re-syncs whenever the file changes.</p>
        </div>
      </div>
    </div>
  );
}

function History() {
  const { data } = useLoad(() => api.get('/pharmacy/inventory/import-logs'));
  if (!data?.logs?.length) return null;
  const label: Record<string, string> = { 'upload:xlsx': 'Excel upload', 'upload:csv': 'CSV upload', 'upload:access': 'Access upload', 'sync-agent': 'Auto sync', manual: 'Added by hand' };
  return (
    <div className="card flush">
      <div className="card-head"><h3>Update history</h3></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>When</th><th>Source</th><th>File</th><th className="num">Added</th><th className="num">Updated</th><th className="num">Set to 0</th><th>Skipped rows</th></tr></thead>
          <tbody>{data.logs.map((l: any) => (
            <tr key={l.id}><td>{timeAgo(l.createdAt)}</td><td>{label[l.source] || l.source}</td><td className="muted">{l.filename || '—'}</td>
              <td className="num">{l.created}</td><td className="num">{l.updated}</td><td className="num">{l.zeroed}</td>
              <td className="muted small">{l.errors.length || '—'}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
