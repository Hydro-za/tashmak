'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Hit = { href: string; label: string };
/** Search box. The dropdown closes on outside click/tap, Escape, selection and any page change, and ignores out-of-date responses. */
export default function GlobalSearch({ jobBase = '/jobs' }: { jobBase?: string }) {
  const [q, setQ] = useState(''); const [res, setRes] = useState<any>(null); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null); const reqId = useRef(0);
  const router = useRouter(); const path = usePathname();

  const reset = () => { reqId.current++; setQ(''); setRes(null); setOpen(false); setBusy(false); };
  useEffect(() => { reset(); }, [path]);                                    // navigation → clear + close
  useEffect(() => {                                                          // click / tap outside → close
    const down = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', down); return () => document.removeEventListener('pointerdown', down);
  }, []);
  useEffect(() => {                                                          // debounced query; stale responses are discarded
    const term = q.trim();
    if (term.length < 2) { reqId.current++; setRes(null); setBusy(false); return; }
    const id = ++reqId.current; setBusy(true);
    const t = setTimeout(async () => {
      const { data, error } = await createClient().rpc('global_search', { p_q: term });
      if (id !== reqId.current) return;
      setBusy(false); setRes(error ? { error: true } : data);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const groups: { title: string; hits: Hit[] }[] = res && !res.error ? [
    { title: 'Jobs', hits: (res.jobs || []).map((r: any) => ({ href: `${jobBase}/${r.id}`, label: `${r.number}${r.title ? ' — ' + r.title : ''} · ${r.customer}` })) },
    { title: 'Quotes', hits: (res.quotes || []).map((r: any) => ({ href: '/quotes/' + r.id, label: `${r.number} — ${r.customer} (${r.status})` })) },
    { title: 'Customers', hits: (res.customers || []).map((r: any) => ({ href: '/customers/' + r.id, label: r.name + (r.company ? ' — ' + r.company : '') })) },
    { title: 'Employees', hits: (res.employees || []).map((r: any) => ({ href: '/employees/' + r.id, label: r.name })) }
  ].filter(g => g.hits.length) : [];
  const show = open && q.trim().length >= 2;
  const go = (href: string) => { reset(); input.current?.blur(); router.push(href); };

  return (
    <div className="search" ref={box} onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); input.current?.blur(); } }}>
      <input ref={input} type="search" placeholder="Search job, quote, customer, product…" value={q} aria-label="Search" aria-expanded={show} autoComplete="off"
        onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      {show && (
        <div className="results" role="listbox" onMouseDown={e => e.preventDefault()}>
          {busy && !groups.length && <div className="grp">Searching…</div>}
          {res?.error && <div className="grp">Search is unavailable right now</div>}
          {groups.map(g => <div key={g.title}><div className="grp">{g.title}</div>{g.hits.map(h => <button type="button" key={h.href} onClick={() => go(h.href)}>{h.label}</button>)}</div>)}
          {!busy && res && !res.error && !groups.length && <div className="grp">No matches</div>}
        </div>
      )}
    </div>
  );
}
