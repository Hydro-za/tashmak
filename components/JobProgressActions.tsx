'use client';
import ActionButton from './ActionButton';
import { assignedJobAction } from '@/lib/assigned-job-actions';

type Props = {
  job: any;
  canDesign: boolean;
  canProduction: boolean;
  canCompleteUnstartedDesign?: boolean;
  hasArtwork?: boolean;
  hasFinal?: boolean;
};

export default function JobProgressActions({ job, canDesign, canProduction, canCompleteUnstartedDesign = false, hasArtwork = false, hasFinal = true }: Props) {
  const status = job.status;
  const designStage = canDesign && status === 'design';
  const productionWaiting = canProduction && ['queued', 'rework'].includes(status);
  const productionActive = canProduction && status === 'in_production';
  if (!designStage && !productionWaiting && !productionActive) return null;

  const action = (label: string, key: string, className: string, successText: string) =>
    <ActionButton className={className} label={label} pendingLabel="Please wait…" action={assignedJobAction} args={[job.id, key]} successText={successText} />;

  return <section className="card job-progress-actions">
    <h2>Job progress</h2>
    {designStage && <div className="grid" style={{ gap: 10 }}>
      <div><b>Design stage</b><p className="muted" style={{ margin: '4px 0 0' }}>{job.design_started_at ? 'Design is in progress. Mark it complete when the artwork is ready for review.' : 'Accept the assigned work by starting design.'}</p></div>
      {!job.design_started_at && action('ACCEPT & START DESIGN', 'design_start', 'bigbtn', 'Design started')}
      {(!!job.design_started_at || canCompleteUnstartedDesign) && action('MARK DESIGN COMPLETE', 'design_complete', 'bigbtn ok', 'Design marked complete')}
    </div>}
    {productionWaiting && <div className="grid" style={{ gap: 10 }}>
      <div><b>{status === 'rework' ? 'Production rework' : 'Production stage'}</b><p className="muted" style={{ margin: '4px 0 0' }}>{status === 'rework' ? 'Accept the rework and restart production.' : 'Accept the assigned work by starting production.'}</p></div>
      {hasArtwork && !hasFinal && <div className="alert warn">No file is marked FINAL yet — check the artwork before printing.</div>}
      {action(status === 'rework' ? 'ACCEPT & RESTART PRODUCTION' : 'ACCEPT & START PRODUCTION', 'production_start', 'bigbtn', 'Production started')}
    </div>}
    {productionActive && <div className="grid" style={{ gap: 10 }}>
      <div><b>Production in progress</b><p className="muted" style={{ margin: '4px 0 0' }}>When the work is finished, mark production complete to move the job to its next stage.</p></div>
      {action('MARK PRODUCTION COMPLETE', 'production_complete', 'bigbtn ok', 'Production marked complete')}
    </div>}
  </section>;
}
