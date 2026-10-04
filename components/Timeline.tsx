import { fmtDateTime } from '@/lib/labels';
export default function Timeline({ events, names }: { events: any[]; names: Record<string, string> }) {
  if (!events.length) return <p className="muted">No activity yet.</p>;
  return <div className="timeline">{events.map(e => (
    <div className="ev" key={e.id}><div>{e.message}</div>{e.notes && <div style={{ fontStyle: 'italic' }}>“{e.notes}”</div>}<small>{fmtDateTime(e.created_at)}{e.user_id && names[e.user_id] ? ' · ' + names[e.user_id] : ''}</small></div>))}</div>;
}
