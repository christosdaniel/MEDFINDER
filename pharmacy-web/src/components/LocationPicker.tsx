import { useState } from 'react';
import { Button, Field } from '@medfinder/web-shared';

/** Lets the pharmacy set its map location: use the browser's GPS or type coordinates. */
export default function LocationPicker({ lat, lng, onChange }: { lat: number | null; lng: number | null; onChange: (lat: number, lng: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const locate = () => {
    if (!navigator.geolocation) { setErr('Your browser cannot share location. Enter the coordinates instead.'); return; }
    setBusy(true); setErr('');
    navigator.geolocation.getCurrentPosition(
      (pos) => { onChange(Math.round(pos.coords.latitude * 1e6) / 1e6, Math.round(pos.coords.longitude * 1e6) / 1e6); setBusy(false); },
      () => { setErr('Could not get your location. Allow location access, or copy the coordinates from Google Maps.'); setBusy(false); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const has = lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng);
  const d = 0.004;
  return (
    <div className="stack">
      <div className="row wrap">
        <Button variant="secondary" icon="pin" onClick={locate} loading={busy}>Use my current location</Button>
        <span className="muted small">Do this while at the pharmacy for the most accurate pin.</span>
      </div>
      <div className="grid-2">
        <Field label="Latitude" hint="e.g. 5.5560">
          <input type="number" step="any" value={lat ?? ''} onChange={(e) => onChange(Number(e.target.value), lng ?? 0)} />
        </Field>
        <Field label="Longitude" hint="e.g. -0.1820">
          <input type="number" step="any" value={lng ?? ''} onChange={(e) => onChange(lat ?? 0, Number(e.target.value))} />
        </Field>
      </div>
      {err && <div className="error-box">{err}</div>}
      {has && (
        <>
          <iframe
            title="Pharmacy location"
            className="map-frame"
            loading="lazy"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng! - d},${lat! - d},${lng! + d},${lat! + d}&layer=mapnik&marker=${lat},${lng}`}
          />
          <a className="small" href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer">Check this pin on Google Maps ↗</a>
        </>
      )}
    </div>
  );
}
