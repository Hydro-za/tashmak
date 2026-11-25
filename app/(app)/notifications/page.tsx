import Link from 'next/link';
import { requireMe } from '@/lib/session';
import { Empty, Top } from '@/components/ui';
import ActionButton from '@/components/ActionButton';
import { markNotificationsRead } from '@/lib/actions';
import { fmtDateTime } from '@/lib/labels';
export const dynamic = 'force-dynamic';
export default async function Notifications() {
  const { sb, user, profile } = await requireMe();
  const [{ data }, stockResult] = await Promise.all([
    sb.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
    profile.role === 'owner' ? sb.rpc('stock_snapshot') : Promise.resolve({ data: { items: [] } })
  ]);
  const lowStock = profile.role === 'owner' ? (stockResult.data?.items || []).filter((item: any) => Number(item.quantity || 0) <= Number(item.minimum_quantity || 0)) : [];
  const href = (n: any) => n.job_id ? (profile.role === 'owner' ? '/jobs/' : '/my-jobs/') + n.job_id : n.quote_id && profile.role === 'owner' ? '/quotes/' + n.quote_id : null;
  const unread = (data || []).filter((n: any) => !n.read_at).length;
  return (<div className="page-notifications"><Top title="Notifications" sub={unread + " unread " + (unread === 1 ? "notification" : "notifications")}>{unread > 0 && <ActionButton className="btn" label="Mark all as read" action={markNotificationsRead} args={[]} successText="All read" />}</Top>
    {profile.role === 'owner' && <section className="card" style={{ marginBottom: 16 }}><div className="top" style={{ marginBottom: 8 }}><div><h2 style={{ margin: 0 }}>Low stock alerts</h2><p className="muted" style={{ margin: '4px 0 0' }}>Materials at or below their minimum stock level.</p></div><span className="badge">{lowStock.length}</span></div>{lowStock.length ? <>{lowStock.map((item: any) => <div className="linkrow" key={item.id}><div style={{ flex: 1 }}><b>{item.name}</b><div className="muted" style={{ fontSize: 12 }}>Minimum: {Number(item.minimum_quantity || 0).toLocaleString('en-ZA', { maximumFractionDigits: 3 })} {item.unit}</div></div><div style={{ textAlign: 'right' }}><b style={{ color: 'var(--bad)' }}>{Number(item.quantity || 0).toLocaleString('en-ZA', { maximumFractionDigits: 3 })} {item.unit}</b><div className="muted" style={{ fontSize: 12 }}>Current stock</div></div></div>)}<div style={{ marginTop: 12 }}><Link className="btn" href="/stock">Manage stock</Link></div></> : <p className="muted">No materials are currently at or below minimum stock.</p>}</section>}
    {!data?.length ? <Empty text="You're all caught up." /> : <div className="card">{data.map((n: any) => { const h = href(n); const inner = <><div><b>{n.title}</b>{!n.read_at && <span className="badge b-sent" style={{ marginLeft: 8 }}>new</span>}</div>{n.body && <div className="muted">{n.body}</div>}<div className="muted" style={{ fontSize: 12 }}>{fmtDateTime(n.created_at)}</div></>;
      return <div className="linkrow" key={n.id} style={{ background: n.read_at ? undefined : 'var(--info-bg)', borderRadius: 8, padding: '10px' }}>{h ? <Link href={h} style={{ textDecoration: 'none', flex: 1 }}>{inner}</Link> : <div style={{ flex: 1 }}>{inner}</div>}{!n.read_at && <ActionButton className="btn sm" label="Read" action={markNotificationsRead} args={[[n.id]]} />}</div>; })}</div>}</div>);
}
