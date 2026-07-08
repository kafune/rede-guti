import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const brandEnv = (key: string, fallback: string) => (env[key] ?? '').trim() || fallback;

    // Identidade da instância em build-time (título, metas OG, manifest PWA).
    // Sem as envs VITE_BRAND_*, os defaults reproduzem a instância original.
    const htmlTitle = brandEnv('VITE_BRAND_HTML_TITLE', 'Rede de Apoiadores – SP (Guti 2026)');
    const htmlDescription = brandEnv(
      'VITE_BRAND_HTML_DESCRIPTION',
      'Aplicativo para cadastro e Gestão de Apoiadores por região do estado de São Paulo.'
    );
    const siteName = brandEnv('VITE_BRAND_SITE_NAME', 'Rede de Apoiadores – SP');
    const publicUrl = brandEnv('VITE_BRAND_PUBLIC_URL', 'https://redeguti.ddnsfree.com').replace(/\/+$/, '');
    const pwaName = brandEnv('VITE_BRAND_PWA_NAME', 'Rede Evangélica – SP (Guti 2026)');
    const pwaShortName = brandEnv('VITE_BRAND_PWA_SHORT_NAME', 'Rede Evangélica');
    const pwaDescription = brandEnv(
      'VITE_BRAND_PWA_DESCRIPTION',
      'Aplicativo para cadastro e gestão de lideranças religiosas apoiadoras por região do estado de São Paulo.'
    );

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        {
          name: 'brand-html',
          transformIndexHtml(html: string) {
            return html
              .replaceAll('%BRAND_HTML_TITLE%', htmlTitle)
              .replaceAll('%BRAND_HTML_DESCRIPTION%', htmlDescription)
              .replaceAll('%BRAND_SITE_NAME%', siteName)
              .replaceAll('%BRAND_PUBLIC_URL%', publicUrl);
          },
        },
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
            name: pwaName,
            short_name: pwaShortName,
            description: pwaDescription,
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
