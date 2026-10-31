import './globals.css';
import type { Metadata, Viewport } from 'next';
import ToastHost from '@/components/ToastHost';

export const metadata: Metadata = {
  title: { default: 'Tashmak Design & Print', template: '%s · Tashmak' },
  description: 'Quotes, jobs and production for Tashmak Design & Print',
  icons: { icon: '/brand/icon.svg', apple: '/brand/icon.svg', shortcut: '/brand/icon.svg' },
  applicationName: 'Tashmak', appleWebApp: { capable: true, title: 'Tashmak', statusBarStyle: 'default' }, formatDetection: { telephone: false }
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: [{ media: '(prefers-color-scheme: light)', color: '#2563eb' }, { media: '(prefers-color-scheme: dark)', color: '#0d1214' }] };

// Applies the saved theme before first paint (no white flash in dark mode). 'system' = no saved choice.
const THEME_JS = "try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: THEME_JS }} /></head><body>{children}<ToastHost /></body></html>);
}
