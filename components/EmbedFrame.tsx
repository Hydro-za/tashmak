'use client';
import { useEffect, useRef, useState } from 'react';

/** Hosts one of the embedded calculator pages. Same-origin only; every message is checked. */
export default function EmbedFrame({ src, getInit, onMessage, minHeight = 600, title, bind }: { src: string; getInit: () => any; onMessage: (type: string, payload: any, reply: (type: string, payload: any) => void) => void; minHeight?: number; title: string; bind?: (reply: (type: string, payload: any) => void) => void }) {
  const ref = useRef<HTMLIFrameElement>(null); const [h, setH] = useState(minHeight);
  const handler = useRef(onMessage); handler.current = onMessage; const init = useRef(getInit); init.current = getInit;
  useEffect(() => {
    const reply = (type: string, payload: any) => ref.current?.contentWindow?.postMessage({ source: 'printops-host', type, payload }, window.location.origin);
    function on(ev: MessageEvent) {
      if (ev.origin !== window.location.origin || ev.source !== ref.current?.contentWindow) return;
      const m = ev.data; if (!m || m.source !== 'printops-calc') return;
      if (m.type === 'ready') { bind?.(reply); reply('init', init.current()); }
      else if (m.type === 'height') setH(Math.max(minHeight, Number(m.payload) + 8));
      else handler.current(m.type, m.payload, reply);
    }
    window.addEventListener('message', on); return () => window.removeEventListener('message', on);
  }, [minHeight]);
  return <iframe ref={ref} src={src} title={title} className="calcframe" style={{ height: h }} />;
}
