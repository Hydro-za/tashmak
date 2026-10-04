'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './ToastHost';

type Result = { ok: boolean; error?: string; noop?: boolean; data?: any };
type Props = {
  action: (...args: any[]) => Promise<Result>; args?: any[]; label: string; pendingLabel?: string; className?: string;
  confirmText?: string; askNote?: string; noteRequired?: boolean; successText?: string; disabled?: boolean; onDone?: (r: Result) => void; reconfirm?: string;
};
/** One safe button for every server action: double-click proof, shows errors, never pretends success. */
export default function ActionButton({ action, args = [], label, pendingLabel, className = 'btn', confirmText, askNote, noteRequired, successText, disabled, onDone, reconfirm }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  async function run() {
    if (lock.current) return;
    if (confirmText && !window.confirm(confirmText)) return;
    let note: string | null | undefined = undefined;
    if (askNote) {
      note = window.prompt(askNote) ?? null;
      if (note === null) return;
      if (noteRequired && !note.trim()) { toast('A note is required', 'bad'); return; }
    }
    lock.current = true; setPending(true);
    try {
      let r = await action(...args, ...(askNote ? [note] : []));
      if (!r.ok && reconfirm && r.error && r.error.includes('Confirmation is required')) {
        const reason = window.prompt(reconfirm);
        if (reason && reason.trim()) r = await action(...args, true, reason);
      }
      if (r.ok) { toast(r.noop ? 'Already done' : (successText || 'Done')); router.refresh(); onDone?.(r); }
      else toast(r.error || 'Could not complete that', 'bad');
    } catch (e: any) { toast('Could not reach the server. Nothing was changed — please try again.', 'bad'); }
    finally { lock.current = false; setPending(false); }
  }
  return <button type="button" className={className} onClick={run} disabled={pending || disabled}>{pending ? (pendingLabel || 'Working…') : label}</button>;
}
