'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function AutoRefresh({ seconds = 45 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => { const focused = document.activeElement instanceof HTMLElement && (document.activeElement.matches('input,select,textarea,[contenteditable="true"]') || !!document.activeElement.closest('form'));
      const pending = document.querySelector('.overlay,[data-noRefresh]:focus,[aria-busy="true"],[data-pending="true"]');
      if (document.visibilityState === 'visible' && navigator.onLine && !focused && !pending) router.refresh(); }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
