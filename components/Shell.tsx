'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Item = { href: string; label: string };
const OWNER: Item[] = [
  { href: '/dashboard', label: 'Dashboard' }, { href: '/jobs', label: 'Jobs' }, { href: '/quotes', label: 'Quotes' }, { href: '/customers', label: 'Customers' },
  { href: '/products', label: 'Products & Pricing' }, { href: '/employees', label: 'Employees' }, { href: '/reports', label: 'Reports' }, { href: '/settings', label: 'Settings' }
];
const EMPLOYEE: Item[] = [{ href: '/my-jobs', label: 'My Jobs' }, { href: '/completed', label: 'Completed' }, { href: '/notifications', label: 'Notifications' }, { href: '/profile', label: 'Profile' }];

function GlobalSearch() {
  const [q, setQ] = useState(''); const [res, setRes] = useState<any>(null); const timer = useRef<any>(null); const router = useRouter();
  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setRes(null); return; }
    timer.current = setTimeout(async () => { const { data } = await createClient().rpc('global_search', { p_q: q }); setRes(data); }, 250);
    return () => clearTimeout(timer.current);
  }, [q]);
  const go = (href: string) => { setQ(''); setRes(null); router.push(href); };
  const grp = (title: string, rows: any[], href: (r: any) => string, label: (r: any) => string) => rows?.length ? <><div className="grp">{title}</div>{rows.map(r => <a key={r.id} href={href(r)} onClick={e => { e.preventDefault(); go(href(r)); }}>{label(r)}</a>)}</> : null;
  return (
    <div className="search"><input type="search" placeholder="Search job no., quote no., customer, product, employee…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" />
      {res && <div className="results">
        {grp('Jobs', res.jobs, r => '/jobs/' + r.id, r => `${r.number} — ${r.customer} (${r.status})`)}
        {grp('Quotes', res.quotes, r => '/quotes/' + r.id, r => `${r.number} — ${r.customer} (${r.status})`)}
        {grp('Customers', res.customers, r => '/customers/' + r.id, r => r.name + (r.company ? ' — ' + r.company : ''))}
        {grp('Employees', res.employees, r => '/employees/' + r.id, r => `${r.name} (${r.role})`)}
        {!res.jobs?.length && !res.quotes?.length && !res.customers?.length && !res.employees?.length && <div className="grp">No matches</div>}
      </div>}
    </div>
  );
}

export default function Shell({ role, name, unread, children }: { role: string; name: string; unread: number; children: React.ReactNode }) {
  const path = usePathname(); const router = useRouter(); const [more, setMore] = useState(false);
  const items = role === 'owner' ? OWNER : EMPLOYEE;
  const on = (h: string) => path === h || path.startsWith(h + '/') || (h === '/quotes' && path.startsWith('/quotes'));
  useEffect(() => setMore(false), [path]);
  async function signOut() { await createClient().auth.signOut(); window.location.href = '/login'; }
  const primary = role === 'owner' ? items.slice(0, 4) : items;
  const rest = role === 'owner' ? items.slice(4) : [];
  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><span>PrintOps</span></div>
        <nav className="nav">{items.map(i => <Link key={i.href} href={i.href} className={on(i.href) ? 'on' : ''}><span>{i.label}</span></Link>)}</nav>
        <div className="who">{name}<br /><b>{role}</b><br /><button className="btn sm" style={{ marginTop: 8 }} onClick={signOut}>Sign out</button></div>
      </aside>
      <main className="main">
        <div className="hdr">{role === 'owner' ? <GlobalSearch /> : <b style={{ flex: 1 }}>{name}</b>}
          <Link href="/notifications" className="bell" aria-label="Notifications">🔔{unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}</Link></div>
        {children}
      </main>
      <nav className="bottom">
        {primary.map(i => <button key={i.href} className={on(i.href) ? 'on' : ''} onClick={() => router.push(i.href)}><span>{i.label.split(' ')[0]}</span></button>)}
        {role === 'owner' ? <button className={more ? 'on' : ''} onClick={() => setMore(!more)}><span>More</span></button> : null}
      </nav>
      {more && <div className="sheet">{rest.map(i => <Link key={i.href} href={i.href}>{i.label}</Link>)}<a href="#" onClick={e => { e.preventDefault(); signOut(); }}>Sign out</a></div>}
    </div>
  );
}
