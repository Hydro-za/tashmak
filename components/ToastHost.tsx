'use client';
import { useEffect, useState } from 'react';
export function toast(msg: string, kind: 'ok' | 'bad' = 'ok') { window.dispatchEvent(new CustomEvent('app-toast', { detail: { msg, kind } })); }
export default function ToastHost() {
  const [t, setT] = useState<{ msg: string; kind: string } | null>(null);
  useEffect(() => {
    let timer: any;
    const on = (e: any) => { setT(e.detail); clearTimeout(timer); timer = setTimeout(() => setT(null), e.detail.kind === 'bad' ? 7000 : 2800); };
    window.addEventListener('app-toast', on); return () => { window.removeEventListener('app-toast', on); clearTimeout(timer); };
  }, []);
  return t ? <div className={'toast ' + (t.kind === 'bad' ? 'bad' : '')} role="status">{t.msg}</div> : null;
}
