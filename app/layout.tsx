import './globals.css';
import type { Metadata, Viewport } from 'next';
import ToastHost from '@/components/ToastHost';

export const metadata: Metadata = { title: 'PrintOps', description: 'Printing & production management' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}<ToastHost /></body></html>);
}
