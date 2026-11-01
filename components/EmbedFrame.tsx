'use client';
import { useEffect, useRef, useState } from 'react';

/** Hosts the quote calculator and keeps its embedded theme aligned with the Tashmak workspace. */
export default function EmbedFrame({ src, getInit, onMessage, minHeight = 600, title, bind }: { src: string; getInit: () => any; onMessage: (type: string, payload: any, reply: (type: string, payload: any) => void) => void; minHeight?: number; title: string; bind?: (reply: (type: string, payload: any) => void) => void }) {
  const ref = useRef<HTMLIFrameElement>(null); const [h, setH] = useState(minHeight);
  const [attempt, setAttempt] = useState(0); const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const sendInit = useRef<() => void>(() => {});
  const lastInitPayload = useRef<any>(null); const initId = useRef(0);
  const handler = useRef(onMessage); handler.current = onMessage; const init = useRef(getInit); init.current = getInit; const binder = useRef(bind); binder.current = bind;
  useEffect(() => {
    const syncTheme = () => {
      const frameDoc = ref.current?.contentDocument;
      if (!frameDoc?.documentElement || !frameDoc.head) return;
      const source = getComputedStyle(document.documentElement);
      const keys = ['--bg','--card','--ink','--muted','--line','--soft','--accent','--accent-ink','--accent-strong','--accent-soft','--shadow','--r','--glass','--glass-heavy','--glass-border'];
      keys.forEach(key => { const value = source.getPropertyValue(key).trim(); if (value) frameDoc.documentElement.style.setProperty(key, value); });
      const style = frameDoc.getElementById('tashmak-embed-theme') || frameDoc.createElement('style');
      style.id = 'tashmak-embed-theme';
      style.textContent = `
        body{background:var(--bg)!important;color:var(--ink)!important}
        .card,.stat,.item,.metric,.modal{background:var(--glass,var(--card))!important;color:var(--ink)!important;border-color:var(--glass-border,var(--line))!important}
        .btn{background:var(--glass,var(--card))!important;color:var(--ink)!important;border-color:var(--line)!important}
        .btn.primary,.pill.on,.nav .on{background:var(--accent)!important;color:var(--accent-ink)!important;border-color:var(--accent)!important}
        input,select,textarea{background:var(--glass,var(--card))!important;color:var(--ink)!important;border-color:var(--line)!important}
        .stickybar{background:var(--glass-heavy,var(--card))!important;color:var(--ink)!important;border:1px solid var(--glass-border,var(--line))}
        #embedbar{background:var(--glass-heavy,var(--card))!important;border-color:var(--glass-border,var(--line))!important}
        #embedbar button{color:var(--ink)!important}
      `;
      if (!style.parentNode) frameDoc.head.appendChild(style);
    };
    const reply = (type: string, payload: any) => ref.current?.contentWindow?.postMessage({ source: 'printops-host', type, payload }, window.location.origin);
    let initialized = false;
    let retry: number | undefined;
    binder.current?.(reply);
    const initializeFrame = () => {
      const payload = init.current();
      if (payload !== lastInitPayload.current) { lastInitPayload.current = payload; initId.current += 1; }
      reply('init', { ...payload, __hostInitId: initId.current });
    };
    sendInit.current = initializeFrame;
    function on(ev: MessageEvent) {
      if (ev.origin !== window.location.origin || ev.source !== ref.current?.contentWindow) return;
      const m = ev.data; if (!m || m.source !== 'printops-calc') return;
      if (m.type === 'ready') { syncTheme(); initializeFrame(); }
      else if (m.type === 'initialized') { initialized = true; if (retry !== undefined) window.clearInterval(retry); syncTheme(); setStatus('ready'); }
      else if (m.type === 'height') { const next = Number(m.payload); if (Number.isFinite(next)) setH(Math.max(minHeight, next + 8)); }
      else handler.current(m.type, m.payload, reply);
    }
    const timeout = window.setTimeout(() => setStatus(current => current === 'ready' ? current : 'error'), 30000);
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    window.addEventListener('storage', syncTheme);
    window.addEventListener('message', on);
    initializeFrame();
    retry = window.setInterval(() => { if (!initialized) initializeFrame(); }, 750);
    return () => { window.clearTimeout(timeout); window.clearInterval(retry); observer.disconnect(); window.removeEventListener('storage', syncTheme); window.removeEventListener('message', on); };
  }, [attempt, minHeight]);
  return <div className="embed-shell" aria-busy={status === 'loading'}>
    <iframe key={attempt} ref={ref} src={src} title={title} className="calcframe" style={{ height: h }} onLoad={() => sendInit.current()} />
    {status === 'loading' && <div className="embed-state" role="status">Loading {title.toLowerCase()}…</div>}
    {status === 'error' && <div className="embed-state embed-state-error" role="alert"><span>Could not load {title.toLowerCase()}.</span><button type="button" className="btn" onClick={() => { setStatus('loading'); setAttempt(value => value + 1); }}>Try again</button></div>}
  </div>;
}
