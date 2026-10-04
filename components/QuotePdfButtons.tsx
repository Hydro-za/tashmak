'use client';
import { useState } from 'react';
import { buildQuotePdf } from '@/lib/quotePdf';
import { toast } from './ToastHost';

export default function QuotePdfButtons({ quote, business }: { quote: any; business: any }) {
  const [url, setUrl] = useState<string | null>(null); const [blob, setBlob] = useState<Blob | null>(null); const [busy, setBusy] = useState(false);
  const fileName = ('Quote-' + quote.number + '.pdf').replace(/[^A-Za-z0-9_.-]/g, '-');
  const canShare = typeof navigator !== 'undefined' && !!(navigator as any).canShare && !!(navigator as any).share;
  async function generate() {
    if (busy) return; setBusy(true);
    try { const b = await buildQuotePdf(quote, business); if (url) URL.revokeObjectURL(url); setBlob(b); setUrl(URL.createObjectURL(b)); toast('PDF ready'); }
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
