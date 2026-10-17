'use client';
import { useState } from 'react';
import { buildQuotePdf } from '@/lib/quotePdf';
import { toast } from './ToastHost';

/** Falls back to the bundled Tashmak logo when no logo has been uploaded in Settings. */
async function fallbackLogo(): Promise<{ logo: string; logoW: number; logoH: number } | null> {
  try {
    const blob = await (await fetch('/brand/logo.png')).blob();
    const data: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(blob); });
    const dims: { w: number; h: number } = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res({ w: i.width, h: i.height }); i.onerror = rej; i.src = data; });
    return { logo: data, logoW: dims.w, logoH: dims.h };
  } catch { return null; }
}
export default function QuotePdfButtons({ quote, business }: { quote: any; business: any }) {
  const [url, setUrl] = useState<string | null>(null); const [blob, setBlob] = useState<Blob | null>(null); const [busy, setBusy] = useState(false);
  const fileName = ('Quote-' + quote.number + '.pdf').replace(/[^A-Za-z0-9_.-]/g, '-');
  const canShare = typeof navigator !== 'undefined' && !!(navigator as any).canShare && !!(navigator as any).share;
  async function generate() {
    if (busy) return; setBusy(true);
    try { const biz = business?.logo ? business : { ...business, ...(await fallbackLogo()) }; const b = await buildQuotePdf(quote, biz); if (url) URL.revokeObjectURL(url); setBlob(b); setUrl(URL.createObjectURL(b)); toast('PDF ready'); }
    catch (e) { toast('Could not create the PDF. Please try again.', 'bad'); } finally { setBusy(false); }
  }
  async function share() {
    if (!blob) return; const file = new File([blob], fileName, { type: 'application/pdf' });
    try { if ((navigator as any).canShare({ files: [file] })) await (navigator as any).share({ files: [file], title: 'Quote ' + quote.number }); else toast('Sharing is not supported on this device — use Download.', 'bad'); }
    catch (e: any) { if (e?.name !== 'AbortError') toast('Could not open the share sheet — use Download.', 'bad'); }
  }
  return (
    <div className="noprint" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <button className="btn primary" onClick={generate} disabled={busy}>{busy ? 'Generating…' : url ? 'REGENERATE PDF' : 'GENERATE PDF'}</button>
      {url && <><a className="btn" href={url} download={fileName}>DOWNLOAD PDF</a><a className="btn ghost" href={url} target="_blank" rel="noreferrer">Preview</a>{canShare && <button className="btn" onClick={share}>Share…</button>}</>}
    </div>
  );
}
