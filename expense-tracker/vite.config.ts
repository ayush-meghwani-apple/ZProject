import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// `base` matters for GitHub Pages (served from /<repo>/).
// Override at build time:  VITE_BASE=/expense-tracker/ npm run build
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  define: {
    // Surfaced in Settings → About so you can confirm a deploy went through.
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'faaah.mp3'],
      manifest: {
        name: 'Orbit',
        short_name: 'Orbit',
        description: 'Your personal hub — expenses, goals and notes, offline-first',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,mp3}'],
      },
    }),
  ],
});
