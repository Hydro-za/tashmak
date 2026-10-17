import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tashmak Design & Print', short_name: 'Tashmak', description: 'Quotes, jobs and production', start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait',
    background_color: '#ffffff', theme_color: '#04767b',
    icons: [{ src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
  };
}
