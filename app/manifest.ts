import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tashmak Design & Print', short_name: 'Tashmak', description: 'Quotes, jobs and production', start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait',
    background_color: '#0f1314', theme_color: '#0f1314',
    icons: [
      { src: '/brand/app-icon-64.png', sizes: '64x64', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}
