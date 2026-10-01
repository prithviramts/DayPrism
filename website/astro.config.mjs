// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import securityHeaders from './src/integrations/security-headers.ts';
import { siteConfig } from './src/site.config.ts';

// Pages that must never be listed in the sitemap.
const PRIVATE = ['/investors', '/404'];

export default defineConfig({
  site: siteConfig.url,
  // /privacy rather than /privacy/: these URLs go into the Play Console, so keep them stable.
  trailingSlash: 'never',
  build: {
    format: 'file',
    // Keep CSS in files, so the Content-Security-Policy needs as few hashes as possible.
    inlineStylesheets: 'never',
  },
  devToolbar: { enabled: false },
  vite: {
    // The desktop 3D scene (React + three.js) is one ~900 KB chunk, about 240 KB gzipped, inside the
    // brief's 350 KB budget. It loads lazily on desktops only, so Vite's 500 KB warning is expected.
    build: { chunkSizeWarningLimit: 1000 },
  },
  integrations: [
    react(),
    sitemap({ filter: (page) => !PRIVATE.some((p) => new URL(page).pathname.startsWith(p)) }),
    securityHeaders(),
  ],
});
