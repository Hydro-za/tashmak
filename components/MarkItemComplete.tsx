'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateProgress } from '@/lib/actions';
import { toast } from './ToastHost';

export default function MarkItemComplete({ jobId, item }: { jobId: string; item: any }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const complete = async () => {
    if (busy || Number(item.qty_completed) >= Number(item.qty_ordered)) return;
    setBusy(true);
    try {
      const result = await updateProgress(jobId, item.id, 0, Number(item.qty_ordered), Number(item.qty_rejected) || 0, Number(item.qty_rework) || 0);
      if (!result.ok) toast(result.error || 'Could not mark this item complete.', 'bad');
      else { toast('Item marked complete'); router.refresh(); }
    } catch { toast('Could not reach the server. Nothing was changed.', 'bad'); }
    finally { setBusy(false); }
  };
  const done = Number(item.qty_completed) >= Number(item.qty_ordered);
  return <button type="button" className={'btn sm ' + (done ? '' : 'primary')} onClick={complete} disabled={busy || done}>
    {busy ? 'Saving…' : done ? 'Item completed' : 'Mark item completed'}
  </button>;
}
