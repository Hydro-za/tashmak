import ActionButton from './ActionButton';
import { setFinalFile } from '@/lib/actions';
import { fmtDateTime } from '@/lib/labels';
const ART = ['artwork', 'design', 'print_ready', 'dtf_artwork'];
const KIND: Record<string, string> = { artwork: 'Customer artwork', logo: 'Logo', design: 'Design', print_ready: 'Print-ready', dtf_artwork: 'DTF artwork', reference: 'Reference', garment_ref: 'Garment reference', production: 'Production file', photo: 'Photo', other: 'Other' };
export default function JobFiles({ jobId, files, urls, names, canFinal, itemNames, productionStarted }: { jobId: string; files: any[]; urls: Record<string, string>; names: Record<string, string>; canFinal: boolean; itemNames: Record<string, string>; productionStarted: boolean }) {
  if (!files.length) return <p className="muted">No files yet.</p>;
  const photos = files.filter(f => f.kind === 'photo' && f.mime_type?.startsWith('image/'));
  const others = files.filter(f => !photos.includes(f));
  const finals = others.filter(f => f.is_final);
  return (
    <div>
      {finals.length > 0 && <div className="alert ok"><b>FINAL / PRODUCTION READY:</b> {finals.map(f => f.file_name + ' (v' + f.version + ')').join(', ')} — production must use only this file.</div>}
      {productionStarted && ART.some(k => others.some(f => f.kind === k)) && !finals.length && <div className="alert warn">No file is marked FINAL yet.</div>}
      {others.map(f => (
        <div key={f.id} className={'fileitem' + (f.is_final ? ' final' : '')}>
          <div><a href={urls[f.id]} target="_blank" rel="noreferrer"><b>{f.file_name}</b></a> {f.is_final && <span className="tag-final">FINAL</span>}
            <div className="muted" style={{ fontSize: 12 }}>{KIND[f.kind] || f.kind}{ART.includes(f.kind) ? ` · v${f.version}` : ''}{f.job_item_id && itemNames[f.job_item_id] ? ' · ' + itemNames[f.job_item_id] : ''} · {names[f.uploaded_by] || 'Someone'} · {fmtDateTime(f.created_at)}</div></div>
          {canFinal && ART.includes(f.kind) && !f.is_final && <ActionButton className="btn sm" label="Mark FINAL" action={setFinalFile} args={[jobId, f.id]} successText="Marked as final" reconfirm="Production has already started. Replacing the approved production file will notify production. Why is it being replaced?" confirmText={productionStarted ? 'Production has already started — replace the approved production file?' : undefined} />}
        </div>))}
      {photos.length > 0 && <><div className="lbl" style={{ margin: '12px 0 6px' }}>Photos</div><div className="thumbs">{photos.map(p => <a key={p.id} href={urls[p.id]} target="_blank" rel="noreferrer"><img src={urls[p.id]} alt={p.file_name} /></a>)}</div></>}
    </div>
  );
}
