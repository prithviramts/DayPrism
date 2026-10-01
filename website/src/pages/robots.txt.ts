// robots.txt, built from the site URL in site.config.ts.
// The investor page is deliberately not listed (listing it would advertise it); it carries
// noindex instead and sits behind Cloudflare Access.
import type { APIRoute } from 'astro';
import { siteConfig } from '../site.config';

export const GET: APIRoute = () =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap-index.xml', siteConfig.url).href}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
