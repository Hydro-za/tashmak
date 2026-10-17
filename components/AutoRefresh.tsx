'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function AutoRefresh({ seconds = 45 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible' && !document.querySelector('.overlay,[data-noRefresh]:focus')) router.refresh(); }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
