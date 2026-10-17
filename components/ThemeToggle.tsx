'use client';
import { useEffect, useState } from 'react';

type Mode = 'light' | 'dark' | 'system';
const apply = (m: Mode) => { const el = document.documentElement; if (m === 'system') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', m); };
const Icon = ({ m }: { m: Mode }) => m === 'light'
  ? <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
  : m === 'dark' ? <svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
  : <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>;

/** Light → Dark → Follow device. Saved per browser; embedded calculator pages pick it up automatically. */
export default function ThemeToggle({ withLabel = false }: { withLabel?: boolean }) {
  const [mode, setMode] = useState<Mode>('system');
  useEffect(() => { const v = localStorage.getItem('theme'); setMode(v === 'light' || v === 'dark' ? v : 'system'); }, []);
  function next() {
    const n: Mode = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
    setMode(n); apply(n); try { n === 'system' ? localStorage.removeItem('theme') : localStorage.setItem('theme', n); } catch { /* private mode */ }
  }
  const label = mode === 'light' ? 'Light mode' : mode === 'dark' ? 'Dark mode' : 'Match device';
  return <button type="button" className="themebtn" onClick={next} title={label + ' — click to change'} aria-label={'Theme: ' + label + '. Click to change.'} style={withLabel ? { width: 'auto', padding: '0 12px', gap: 8, fontSize: 13, fontWeight: 600 } : undefined}><Icon m={mode} />{withLabel && <span>{label}</span>}</button>;
}
