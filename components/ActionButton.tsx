'use client';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { toast } from './ToastHost';

type Result = { ok: boolean; error?: string; noop?: boolean; data?: any };
type Props = {
  action: (...args: any[]) => Promise<Result>; args?: any[]; label: string; pendingLabel?: string; className?: string;
  confirmText?: string; askNote?: string; noteRequired?: boolean; successText?: string; disabled?: boolean; onDone?: (r: Result) => void; reconfirm?: string;
};

/** One safe button for every server action: consistent in-app confirmation and reason dialog. */
export default function ActionButton({ action, args = [], label, pendingLabel, className = 'btn', confirmText, askNote, noteRequired, successText, disabled, onDone, reconfirm }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [reconfirming, setReconfirming] = useState(false);
  const lock = useRef(false);

  function begin() {
    if (lock.current || pending || disabled) return;
    if (confirmText || askNote || reconfirm) {
      setNote('');
      setDialogError('');
      setReconfirming(false);
      setOpen(true);
    } else {
      void execute();
    }
  }

  async function execute(reason?: string, confirmedReason = false) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setDialogError('');
    try {
      let r = await action(...args, ...(askNote && !confirmedReason ? [reason ?? ''] : confirmedReason ? [true, reason ?? ''] : []));
      if (!r.ok && reconfirm && r.error && r.error.includes('Confirmation is required')) {
        lock.current = false;
        setPending(false);
        setReconfirming(true);
        setNote('');
        setDialogError('');
        setOpen(true);
        return;
      }
      if (r.ok) {
        setOpen(false);
        toast(r.noop ? 'Already done' : (successText || 'Done'));
        router.refresh();
        onDone?.(r);
      } else {
        if (open) setDialogError(r.error || 'Could not complete that action.');
        else toast(r.error || 'Could not complete that', 'bad');
      }
    } catch {
      if (open) setDialogError('Could not reach the server. Nothing was changed — please try again.');
      else toast('Could not reach the server. Nothing was changed — please try again.', 'bad');
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  async function submitDialog() {
    if (pending || lock.current) return;
    if ((noteRequired || reconfirming) && !note.trim()) {
      setDialogError('Please enter a reason before continuing.');
      return;
    }
    if (reconfirming) await execute(note.trim(), true);
    else if (askNote) await execute(note.trim());
    else await execute();
  }

  const title = reconfirming ? (reconfirm || 'Please provide a reason') : askNote || 'Confirm action';
  return <>
    <button type="button" className={className} onClick={begin} disabled={pending || disabled}>{pending ? (pendingLabel || 'Working…') : label}</button>
    {open && typeof document !== 'undefined' && createPortal(<div className="overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !pending) setOpen(false); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="action-dialog-title">
        <header className="mh"><b id="action-dialog-title">{title}</b><button type="button" className="btn ghost sm" onClick={() => setOpen(false)} disabled={pending} aria-label="Close">✕</button></header>
        <div className="mb">
          {confirmText && !reconfirming && <p className="muted" style={{ marginTop: 0 }}>{confirmText}</p>}
          {(askNote || reconfirming) && <div className="field">
            <label>{reconfirming ? 'Reason *' : noteRequired ? 'Reason *' : 'Reason / notes (optional)'}</label>
            <textarea autoFocus value={note} onChange={e => { setNote(e.target.value); setDialogError(''); }} rows={4} maxLength={2000} placeholder={reconfirming ? 'Explain why this action needs confirmation…' : 'Add a short note…'} />
          </div>}
          {dialogError && <div className="alert bad" role="alert" style={{ marginTop: 10 }}>{dialogError}</div>}
        </div>
        <footer className="mf">
          <button type="button" className="btn" onClick={() => setOpen(false)} disabled={pending}>Cancel</button>
          <button type="button" className="btn primary" onClick={submitDialog} disabled={pending}>{pending ? 'Working…' : 'Confirm'}</button>
        </footer>
      </section>
    </div>, document.body)}
  </>;
}
