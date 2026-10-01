// Serves the built site (dist/) on http://localhost:4321 the way Cloudflare Pages will:
// clean URLs (/privacy → privacy.html), the 404 page, and every header from dist/_headers,
// so the Content-Security-Policy can be tested locally before deploying. Text files are
// compressed (Brotli or gzip) like Cloudflare does, so speed measurements are realistic.
// Plain Node, no dependencies. Run `npm run build` first, then `npm run preview`.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('../dist', import.meta.url)).replace(/[\/]$/, '');
const PORT = Number(process.env.PORT ?? 4321);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
};

/** Parses Cloudflare's _headers format: a path pattern line, then indented "Name: value" lines. */
async function loadHeaderRules() {
  const rules = [];
  let text = '';
  try { text = await readFile(join(ROOT, '_headers'), 'utf8'); } catch { return rules; }
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) rules.push({ pattern: line.trim(), headers: [] });
    else {
      const i = line.indexOf(':');
      rules.at(-1)?.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    }
  }
  return rules;
}

const matches = (pattern, path) =>
  pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : pattern === path;

async function findFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath)).replace(/^([\\/])+/, '');
  const base = join(ROOT, clean);
  if (!base.startsWith(ROOT)) return null; // refuse ../ path traversal
  for (const candidate of [base, `${base}.html`, join(base, 'index.html')]) {
    try { if ((await stat(candidate)).isFile()) return candidate; } catch { /* try next */ }
  }
  return null;
}

createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  const rules = await loadHeaderRules();
  for (const rule of rules) if (matches(rule.pattern, path)) for (const [k, v] of rule.headers) res.setHeader(k, v);
  const file = await findFile(path);
  const target = file ?? join(ROOT, '404.html');
  res.statusCode = file ? 200 : 404;
  res.setHeader('Content-Type', TYPES[extname(target)] ?? 'application/octet-stream');
  let body;
  try { body = await readFile(target); } catch { res.statusCode = 500; res.end('Build the site first: npm run build'); return; }
  const accept = String(req.headers['accept-encoding'] ?? '');
  if (/\.(html|js|css|json|svg|xml|txt|webmanifest)$/.test(target)) {
    res.setHeader('Vary', 'Accept-Encoding');
    if (accept.includes('br')) { res.setHeader('Content-Encoding', 'br'); body = brotliCompressSync(body); }
    else if (accept.includes('gzip')) { res.setHeader('Content-Encoding', 'gzip'); body = gzipSync(body); }
  }
  res.end(body);
}).listen(PORT, '127.0.0.1', () => console.log(`Serving dist/ with production headers on http://localhost:${PORT}`));
