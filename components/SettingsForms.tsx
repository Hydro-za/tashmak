'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveSystemSetting } from '@/lib/actions';
import { toast } from './ToastHost';

type F = { k: string; l: string; t: 'text' | 'area' | 'int' | 'select' | 'check' | 'cats'; opts?: [string, string][]; help?: string; max?: number };
function numberPreview(v: any) {
  const yr = new Date().getFullYear(); const f = (n: number) => [v.prefix || '', v.yearFormat === 'YYYY' ? String(yr) : v.yearFormat === 'YY' ? String(yr).slice(-2) : '', String(n).padStart(Math.max(1, Number(v.length) || 4), '0')].filter(Boolean).join(v.separator ?? '-');
  return f(Number(v.startNumber) || 1) + ', ' + f((Number(v.startNumber) || 1) + 1);
}
export function SettingsCard({ skey, title, value, fields, cats, preview }: { skey: string; title: string; value: any; fields: F[]; cats?: string[]; preview?: boolean }) {
  const router = useRouter(); const [v, setV] = useState<any>(value); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function save() {
    setBusy(true); setErr(''); const out = { ...v }; fields.forEach(f => { if (f.t === 'int') out[f.k] = Number(out[f.k]); });
    const r = await saveSystemSetting(skey, out).catch(() => ({ ok: false, error: 'Could not reach the server.' } as any)); setBusy(false);
    if (r.ok) { toast('Saved'); router.refresh(); } else setErr(r.error || 'Could not save');
  }
  return (<div className="card"><h2>{title}</h2>
    {preview && <div className="alert info">Next numbers will look like: <b>{numberPreview(v)}</b>. Numbers are unique and never reused.</div>}
    <div className="grid g2">{fields.map(f => <div className="field" key={f.k} style={{ gridColumn: f.t === 'area' || f.t === 'cats' ? '1/-1' : undefined }}>
      {f.t !== 'check' && <label>{f.l}</label>}
      {f.t === 'text' && <input value={v[f.k] ?? ''} onChange={e => setV({ ...v, [f.k]: e.target.value })} />}
      {f.t === 'area' && <textarea value={v[f.k] ?? ''} onChange={e => setV({ ...v, [f.k]: e.target.value })} />}
      {f.t === 'int' && <input type="number" min="0" step="1" value={v[f.k] ?? ''} onChange={e => setV({ ...v, [f.k]: e.target.value })} />}
      {f.t === 'select' && <select value={v[f.k]} onChange={e => setV({ ...v, [f.k]: e.target.value })}>{f.opts!.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}</select>}
      {f.t === 'check' && <label className="chk"><input type="checkbox" checked={!!v[f.k]} onChange={e => setV({ ...v, [f.k]: e.target.checked })} /> {f.l}</label>}
      {f.t === 'cats' && <div className="chips">{(cats || []).map(c => <button type="button" key={c} className={(v[f.k] || []).includes(c) ? 'on' : ''} onClick={() => setV({ ...v, [f.k]: (v[f.k] || []).includes(c) ? v[f.k].filter((x: string) => x !== c) : [...(v[f.k] || []), c] })}>{c}</button>)}</div>}
      {f.help && <div className="help">{f.help}</div>}</div>)}</div>
    {err && <div className="alert bad" style={{ marginTop: 10 }}>{err}</div>}<button className="btn primary" style={{ marginTop: 12 }} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>);
}
export function BusinessCard({ value }: { value: any }) {
  const router = useRouter(); const [v, setV] = useState<any>(value); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return; if (f.size > 4e6) { toast('Image too large (max 4 MB)', 'bad'); return; }
    const url = URL.createObjectURL(f), img = new Image();
    img.onload = () => { const sc = Math.min(1, 360 / img.width), w = Math.round(img.width * sc), h = Math.round(img.height * sc), cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d')!.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
      let d = cv.toDataURL('image/png'); if (d.length > 220000) d = cv.toDataURL('image/jpeg', 0.85); setV((x: any) => ({ ...x, logo: d, logoW: w, logoH: h })); };
    img.onerror = () => toast('Could not read that image', 'bad'); img.src = url;
  }
  async function save() { setBusy(true); setErr(''); const r = await saveSystemSetting('business', v).catch(() => ({ ok: false, error: 'Could not reach the server.' } as any)); setBusy(false); if (r.ok) { toast('Saved'); router.refresh(); } else setErr(r.error || 'Could not save'); }
  const t = (k: string, l: string) => <div className="field"><label>{l}</label><input value={v[k] ?? ''} onChange={e => setV({ ...v, [k]: e.target.value })} /></div>;
  return (<div className="card"><h2>Business details (shown on quote PDFs)</h2><div className="grid g2">{t('name', 'Business name *')}{t('phone', 'Phone')}{t('email', 'Email')}{t('website', 'Website')}{t('regNo', 'Company reg. no.')}{t('vatNo', 'VAT number')}</div>
    <div className="field" style={{ marginTop: 12 }}><label>Address</label><textarea value={v.address ?? ''} onChange={e => setV({ ...v, address: e.target.value })} /></div>
    <div className="field" style={{ marginTop: 12 }}><label>Logo</label><div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>{v.logo ? <img src={v.logo} alt="Logo" style={{ maxHeight: 56, maxWidth: 200, background: '#fff', border: '1px solid var(--line)', borderRadius: 6, padding: 4 }} /> : <span className="muted">No logo</span>}
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onLogo} style={{ maxWidth: 260 }} />{v.logo && <button className="btn sm danger" type="button" onClick={() => setV({ ...v, logo: '', logoW: 0, logoH: 0 })}>Remove</button>}</div></div>
    {err && <div className="alert bad" style={{ marginTop: 10 }}>{err}</div>}<button className="btn primary" style={{ marginTop: 12 }} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>);
}
