'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import EmbedFrame from './EmbedFrame';
import { saveQuoteAction, saveCustomer } from '@/lib/actions';
import { toast } from './ToastHost';

type Cust = { id: string; name: string; company: string | null };
export default function QuoteBuilder({ init, customers: initial, customerId: initialCustomer, backHref }: { init: any; customers: Cust[]; customerId: string; backHref: string }) {
  const router = useRouter();
  const [customers, setCustomers] = useState<Cust[]>(Array.isArray(initial) ? initial.filter(c => c && typeof c.id === 'string') : []); const [cid, setCid] = useState(initialCustomer || '');
  const [dirty, setDirty] = useState(false); const [adding, setAdding] = useState(false); const [nc, setNc] = useState({ name: '', company: '', phone: '', email: '' }); const [busy, setBusy] = useState(false);
  const reqId = useRef(typeof crypto !== 'undefined' ? crypto.randomUUID() : String(Math.random()));
  const replyRef = useRef<((t: string, p: any) => void) | null>(null); const saving = useRef(false);
  const cidRef = useRef(cid); cidRef.current = cid; const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const cust = customers.find(c => c.id === cid);
  const sendCustomer = (id: string) => { const c = customers.find(x => x.id === id); replyRef.current?.('customer', c ? { id: c.id, name: c.name } : null); };
  function pick(id: string) { setCid(id); const c = customers.find(x => x.id === id); replyRef.current?.('customer', c ? { id: c.id, name: c.name } : null); setDirty(true); }
  async function addCustomer() {
    setBusy(true); const r = await saveCustomer(nc).catch(() => ({ ok: false, error: 'Could not reach the server.' } as any)); setBusy(false);
    if (!r.ok) { toast(r.error, 'bad'); return; }
    if (!r.data?.id) { toast('Customer save returned no customer record. Refresh and check the customer list before continuing.', 'bad'); return; }
    const c = { id: r.data.id, name: nc.name.trim(), company: nc.company.trim() || null }; setCustomers([...customers, c].sort((a, b) => a.name.localeCompare(b.name))); setCid(c.id); setAdding(false); setNc({ name: '', company: '', phone: '', email: '' });
    replyRef.current?.('customer', { id: c.id, name: c.name }); toast('Customer added');
  }
  const payload = { ...init, customer: cust ? { id: cust.id, name: cust.name } : null };
  return (
    <div>
      <div className="card noprint">
        <div className="grid g2" style={{ alignItems: 'end' }}>
          <div className="field"><label>Customer *</label>
            <select value={cid} onChange={e => pick(e.target.value)}><option value="">Choose a customer…</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ' — ' + c.company : ''}</option>)}</select></div>
          <div style={{ display: 'flex', gap: 8 }}><button className="btn" onClick={() => setAdding(!adding)}>{adding ? 'Cancel new customer' : '+ New customer'}</button>
            <button className="btn ghost" onClick={() => { if (!dirtyRef.current || window.confirm('Discard this quote without saving?')) router.push(backHref); }}>Cancel</button></div>
        </div>
        {adding && <div className="grid g2" style={{ marginTop: 12 }}>
          <div className="field"><label>Name *</label><input value={nc.name} onChange={e => setNc({ ...nc, name: e.target.value })} /></div><div className="field"><label>Company</label><input value={nc.company} onChange={e => setNc({ ...nc, company: e.target.value })} /></div>
          <div className="field"><label>Phone</label><input value={nc.phone} onChange={e => setNc({ ...nc, phone: e.target.value })} /></div><div className="field"><label>Email</label><input value={nc.email} onChange={e => setNc({ ...nc, email: e.target.value })} /></div>
          <div><button className="btn primary" onClick={addCustomer} disabled={busy || !nc.name.trim()}>{busy ? 'Saving…' : 'Save customer'}</button></div></div>}
        {cust === undefined && <p className="muted" style={{ marginBottom: 0 }}>Every quote is linked to a customer. Choose one (or add one) before saving.</p>}
      </div>
      <EmbedFrame src="/calculator.html" title="Quote calculator" getInit={() => payload} bind={r => { replyRef.current = r; sendCustomer(cidRef.current); }}
        onMessage={async (type, p, reply) => {
          if (type === 'dirty') setDirty(true);
          else if (type === 'cancel') { if (!dirtyRef.current || window.confirm('Discard this quote without saving?')) router.push(backHref); }
          else if (type === 'save') {
            if (saving.current) return; saving.current = true;
            try {
              const r = await saveQuoteAction({ customerId: cidRef.current, requestId: reqId.current, quote: p.quote, items: p.items });
              if (r.ok && r.data?.id) { setDirty(false); toast('Quote ' + (r.data.number || '') + ' saved'); router.push('/quotes/' + r.data.id); router.refresh(); }
              else if (r.ok) reply('error', 'The server reported success but returned no quote ID. Refresh the quotes list before trying again.');
              else reply('error', r.error || 'Could not save');
            } catch { reply('error', 'Could not reach the server. Nothing was saved — please try again.'); } finally { saving.current = false; }
          }
        }} />
    </div>
  );
}
