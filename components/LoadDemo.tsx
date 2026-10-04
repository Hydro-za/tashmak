'use client';
import ActionButton from './ActionButton';
import { loadDemoCatalogue } from '@/lib/actions';
export default function LoadDemo() {
  return <ActionButton className="btn primary" label="Load demo defaults" pendingLabel="Loading…" action={loadDemoCatalogue} successText="Demo defaults loaded" confirmText="Load placeholder materials, machines, labour, finishing and products? These are examples with made-up prices — replace them before quoting real customers." />;
}
