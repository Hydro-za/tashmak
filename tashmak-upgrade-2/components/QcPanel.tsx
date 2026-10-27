'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setQcResult } from '@/lib/actions';
import { QC_LABEL, fmtDateTime } from '@/lib/labels';
import { toast } from './ToastHost';

/** Three states only: Not Checked / Passed / Not Passed. Never set automatically. */
export default function QcPanel({ jobId, status, qcStatus, checkedBy, checkedAt, note, canCheck, awaiting }: { jobId: string; status: string; qcStatus: string; checkedBy: string | null; checkedAt: string | null; note: string | null; canCheck: boolean; awaiting: boolean }) {
  const router = useRouter(); const [n, setN] = useState(''); const [busy, setBusy] = useState(false); const lock = useRef(false);
  const m = QC_LABEL[qcStatus] || QC_LABEL.not_checked;
  async function send(result: 'passed' | 'not_passed') {
    if (lock.current) return;
    if (result === 'not_passed' && !window.confirm('Mark this job as NOT PASSED? It goes back to production.')) return;
    lock.current = true; setBusy(true);
    const r = await setQcResult(jobId, result, n).catch(() => ({ ok: false, error: 'Could not reach the server. Nothing was saved.' } as any));
    lock.current = false; setBusy(false);
    if (r.ok) { toast(r.noop ? 'Already recorded' : result === 'passed' ? 'Quality check passed' : 'Marked as not passed'); setN(''); router.refresh(); } else toast(r.error || 'Could not save', 'bad');
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className={'badge b-' + m.tone} style={{ fontSize: 14, padding: '4px 14px' }}>{m.label}</span>
        {checkedAt && <span className="muted">{checkedBy ? checkedBy + ' · ' : ''}{fmtDateTime(checkedAt)}</span>}
      </div>
      {note && <div className="alert info" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{qcStatus === 'not_passed' ? 'Why it did not pass: ' : 'Note: '}{note}</div>}
      {awaiting && !canCheck && <p className="muted" style={{ marginBottom: 0 }}>Waiting for someone with permission to check this job.</p>}
      {awaiting && canCheck && (
        <div style={{ marginTop: 12 }}>
          <div className="field"><label>Short note (optional — say why if it did not pass)</label><input value={n} onChange={e => setN(e.target.value)} maxLength={500} placeholder="e.g. Edges not cut straight" /></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn primary" style={{ minHeight: 46, flex: 1 }} disabled={busy} onClick={() => send('passed')}>PASSED</button>
            <button className="btn danger" style={{ minHeight: 46, flex: 1 }} disabled={busy} onClick={() => send('not_passed')}>NOT PASSED</button>
          </div>
        </div>)}
    </div>
  );
}
