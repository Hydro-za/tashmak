'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import NavIcon from './NavIcons';
import { fmtDateTime } from '@/lib/labels';

type N = { id: string; type: string; title: string; body: string | null; job_id: string | null; quote_id: string | null; read_at: string | null; created_at: string };
/** Bell + dropdown panel wired to the notifications table (row-level security: you only ever get your own). */
export default function NotificationBell({ initialUnread, jobBase, canQuotes }: { initialUnread: number; jobBase: string; canQuotes: boolean }) {
  const [open, setOpen] = useState(false); const [items, setItems] = useState<N[] | null>(null); const [unread, setUnread] = useState(initialUnread);
  const [err, setErr] = useState(''); const box = useRef<HTMLDivElement>(null); const router = useRouter(); const path = usePathname();

  const count = useCallback(async () => {
    const { count: c, error } = await createClient().from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
    if (!error && c !== null) setUnread(c);
  }, []);
  const load = useCallback(async () => {
    setErr('');
    const { data, error } = await createClient().from('notifications').select('id,type,title,body,job_id,quote_id,read_at,created_at').order('created_at', { ascending: false }).limit(20);
    if (error) { setErr('Could not load notifications. Check your connection and try again.'); return; }
    setItems((data || []) as N[]); count();
  }, [count]);

  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    const down = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, []);
  useEffect(() => {                                                      // deadline reminders (once an hour per browser) + live count
    const last = Number(sessionStorage.getItem('deadline-check') || 0);
    if (Date.now() - last > 3600_000) { sessionStorage.setItem('deadline-check', String(Date.now())); createClient().rpc('refresh_deadline_notifications').then(() => count()); } else count();
    const iv = setInterval(() => { if (document.visibilityState === 'visible') count(); }, 60_000);
    const vis = () => { if (document.visibilityState === 'visible') count(); };
    document.addEventListener('visibilitychange', vis); return () => { clearInterval(iv); document.removeEventListener('visibilitychange', vis); };
  }, [count]);

  function toggle() { const n = !open; setOpen(n); if (n) load(); }
  const href = (n: N) => n.job_id ? `${jobBase}/${n.job_id}` : n.quote_id && canQuotes ? '/quotes/' + n.quote_id : null;
  async function openItem(n: N) {
    const h = href(n); setOpen(false);
    if (!n.read_at) { setItems(l => l && l.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)); setUnread(u => Math.max(0, u - 1)); createClient().rpc('mark_notifications_read', { p_ids: [n.id] }).then(({ error }) => { if (error) count(); }); }
    if (h) router.push(h);
  }
  async function markAll() {
    const { error } = await createClient().rpc('mark_notifications_read', { p_ids: null });
    if (error) { setErr('Could not mark them as read. Please try again.'); return; }
    setItems(l => l && l.map(x => ({ ...x, read_at: x.read_at || new Date().toISOString() }))); setUnread(0);
  }
  return (
    <div className="bellwrap" ref={box}>
      <button type="button" className="bell" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`} aria-expanded={open} onClick={toggle}><NavIcon name="notifications" />{unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}</button>
      {open && (
        <div className="notifpanel" role="dialog" aria-label="Notifications">
          <div className="nphead"><b>Notifications</b>{unread > 0 && <button type="button" className="btn sm" onClick={markAll}>Mark all read</button>}</div>
          <div className="npbody">
            {err && <div className="alert bad" style={{ margin: 8 }}>{err} <button type="button" className="btn sm" onClick={load}>Retry</button></div>}
            {!err && items === null && <div className="np-empty">Loading…</div>}
            {!err && items && items.length === 0 && <div className="np-empty">You&apos;re all caught up — no notifications yet.</div>}
            {items && items.map(n => (
              <button type="button" key={n.id} className={'npitem' + (n.read_at ? '' : ' unread')} onClick={() => openItem(n)}>
                <span className="npt">{n.title}</span>{n.body && <span className="npb">{n.body}</span>}<span className="npd">{fmtDateTime(n.created_at)}</span>
              </button>))}
          </div>
          <div className="npfoot"><Link href="/notifications" onClick={() => setOpen(false)}>See all notifications</Link></div>
        </div>
      )}
    </div>
  );
}
