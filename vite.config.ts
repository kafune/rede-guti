import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: [
            'android-chrome-192x192.png',
            'android-chrome-512x512.png',
            'apple-touch-icon.png',
            'favicon-16x16.png',
            'favicon-32x32.png',
            'favicon.ico',
          ],
          manifest: {
            name: 'Rede Evang\u00e9lica \u2013 SP (Guti 2026)',
            short_name: 'Rede Evang\u00e9lica',
            description:
              'Aplicativo para cadastro e gest\u00e3o de lideran\u00e7as religiosas apoiadoras por regi\u00e3o do estado de S\u00e3o Paulo.',
            start_url: '/',
            scope: '/',
            display: 'standalone',
            background_color: '#0f172a',
            theme_color: '#0f172a',
            icons: [
              {
                src: '/android-chrome-192x192.png',
                sizes: '192x192',
                type: 'image/png',
              },
              {
                src: '/android-chrome-512x512.png',
                sizes: '512x512',
                type: 'image/png',
              },
            ],
          },
          workbox: {
            cleanupOutdatedCaches: true,
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                handler: 'StaleWhileRevalidate',
                options: {
                  cacheName: 'google-fonts-stylesheets',
                },
              },
              {
                urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'google-fonts-webfonts',
                  expiration: {
                    maxEntries: 30,
                    maxAgeSeconds: 60 * 60 * 24 * 365,
                  },
                },
              },
              {
                urlPattern: /^https:\/\/cdn\.tailwindcss\.com\/.*/i,
                handler: 'StaleWhileRevalidate',
                options: {
                  cacheName: 'tailwind-cdn',
                },
              },
              {
                urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\/.*/i,
                handler: 'StaleWhileRevalidate',
                options: {
                  cacheName: 'cdnjs-assets',
                },
              },
              {
                urlPattern: /^https:\/\/esm\.sh\/.*/i,
                handler: 'StaleWhileRevalidate',
                options: {
                  cacheName: 'esm-sh-modules',
                },
              },
            ],
          },
        }),
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
