'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
/** Remembers the last job filter for this browser session (no extra tabs needed). */
export default function FilterMemory() {
  const sp = useSearchParams(); const router = useRouter(); const qs = sp.toString();
  useEffect(() => {
    if (qs) sessionStorage.setItem('jobs-filter', qs);
    else { const saved = sessionStorage.getItem('jobs-filter'); if (saved && !sessionStorage.getItem('jobs-filter-reset')) router.replace('/jobs?' + saved); sessionStorage.removeItem('jobs-filter-reset'); }
  }, [qs, router]);
  return null;
}
export function ResetFilter() { return <a href="/jobs" className="on" onClick={() => { sessionStorage.removeItem('jobs-filter'); sessionStorage.setItem('jobs-filter-reset', '1'); }} style={{ borderStyle: 'dashed' }}>Clear filters</a>; }
