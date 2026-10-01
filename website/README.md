# DayPrism website

The public site for DayPrism (`/`, `/privacy`, `/terms`, `/delete-account`, a `404`) and a private
investor page (`/investors`). Static HTML built with Astro; no server, no database, no cookies, no
tracking. The full brief is in [BRIEF.md](BRIEF.md).

## Run it

You need Node.js 22.12 or newer (`node -v`).

```bash
npm install          # once
npm run dev          # http://localhost:4321, reloads as you edit
npm run build        # type-checks, then builds the site into dist/ (and writes dist/_headers)
npm run preview      # serves dist/ exactly like Cloudflare will: clean URLs, 404, all headers, compression
npm audit            # must say "found 0 vulnerabilities" before every deploy
```

Testing tip: add `?sky=high`, `?sky=medium` or `?sky=low` to the URL to force a hero quality level.
The sunrise plays once per browser tab; open a new tab (or clear session storage) to see it again.

## Change things without touching code

| What | Where |
|---|---|
| Play Store link, contact email, founder name/photo, app version | `src/site.config.ts` |
| Home page words | `src/content/home.yaml` |
| FAQ | `src/content/faq.yaml` |
| Investor page words (the ask, founder story) | `src/content/investors.yaml` |
| Privacy policy, terms, delete-account | `src/content/legal/*.md` |

- **Going live on Google Play:** paste the listing URL into `PLAY_STORE_URL` and rebuild. Every badge
  switches from "Coming soon" to a real link. Google's brand rules require the official badge
  artwork: download it from <https://play.google.com/intl/en_us/badges/> and save it as
  `src/assets/badges/google-play.png` (or `.svg`). It's picked up automatically; until then a plain
  text button is shown.
- **Real app screenshots:** save them as `src/assets/screens/today.png`, `timeline.png` and
  `insights.png` (portrait, 1080×2400 or similar). They replace the HTML versions of those screens
  automatically and are converted to AVIF/WebP at build time.
- **Founder photo:** put it in `src/assets/` (e.g. `founder.jpg`) and set `founder.photo: 'founder.jpg'`.
- **Legal texts:** the app is the source of truth (`dayprism-v1/src/features/legal.ts` →
  `PRIVACY.md`/`TERMS.md`). When they change, copy the new text into `src/content/legal/`.
- **Icons and social image:** regenerated from the app icon with `python scripts/make-images.py`.

## How it's built

```
website/
├─ astro.config.mjs            Astro setup: React, sitemap (without /investors), security headers
├─ public/                     Copied as-is: fonts (self-hosted, subset), icons, og-image, manifest
├─ scripts/
│  ├─ serve.mjs                Local production preview with the real _headers (no dependencies)
│  └─ make-images.py           Rebuilds favicons and the social-share image from the app icon
└─ src/
   ├─ site.config.ts           The one config file
   ├─ content/ + content.config.ts   All words, checked against a schema at build time
   ├─ layouts/                 Base (head, nav, footer, theme boot script), Legal
   ├─ pages/                   One file per URL
   ├─ components/              Sections of the home page, phone + app screens, badge, dial, town
   ├─ integrations/security-headers.ts   Writes dist/_headers with the CSP hashes after each build
   ├─ lib/town.ts              The procedurally generated town (same seed everywhere)
   └─ scripts/                 Browser code (see below)
```

**Pages are plain HTML.** The only JavaScript that runs before the page is readable is a 0.6 KB
inline script in the `<head>` that applies the saved/system theme (so the page never flashes the
wrong theme) and decides whether the sunrise plays. Everything else loads afterwards:

| Script | When | Size (gzip) | Job |
|---|---|---|---|
| `theme.ts`, `contact.ts`, nav, `entrance.ts`, `how.ts` | on load | ~3 KB together | dial, email link, skip the entrance, "how it works" steps |
| `sky-loader.ts` | on load | <1 KB | picks the hero level, then loads one of the two below when the page is idle |
| `sky/lite.ts` + `sky/sky-worker.ts` | idle, phones/tablets/laptops ("medium") | ~13 KB | sky shader in plain WebGL, drawn inside a Web Worker (OffscreenCanvas) so the page never waits |
| `sky/mount.tsx` + `SkyScene.tsx` | idle, strong desktops ("high") | ~310 KB | React Three Fiber scene with the 3D low-poly town |
| `motion.ts` (GSAP) | first scroll, never with reduced motion | ~45 KB | scroll effects |

**The hero has three levels**, chosen per device: *high* (3D town, 44-sample god rays), *medium*
(the same shader with 20 samples at lower resolution and a painted town with shader-lit windows),
*low* (no WebGL: CSS gradients and an SVG town, which also play the sunrise and the window-by-window
moonrise). Low is used with Save-Data, 2G, ≤2 GB memory or no WebGL. The CSS version is always
painted first, so the text is readable immediately; WebGL fades in over it when ready, pauses when
the hero is off-screen or the tab is hidden, and falls back silently if anything fails.

## Why each dependency is here

Pinned to exact versions (`.npmrc` has `save-exact=true`). Nothing is loaded from other sites at runtime.

| Package | Why |
|---|---|
| `astro` | Builds the static pages; ships no JavaScript unless we ask for it. |
| `@astrojs/react` | Compiles the React (`.tsx`) code used by the desktop 3D scene. |
| `@astrojs/sitemap` | Generates `sitemap-index.xml` (with `/investors` and `404` left out). |
| `react`, `react-dom` | Required by React Three Fiber (desktop 3D scene only). |
| `three` | WebGL engine for the desktop 3D town. |
| `@react-three/fiber` | Lets the three.js scene be written as React components. |
| `gsap` | Scroll-driven motion (ScrollTrigger). Free "no charge" licence; it's not open source, but allows this use. |
| `js-yaml` | Reads the YAML content files. Astro already depends on it; listed because our code imports it. |
| dev: `@astrojs/check`, `typescript`, `@types/*` | Type-checking during `npm run build`. Never shipped to visitors. |

Deliberately **not** used: `@react-three/drei` (the brief listed it, but nothing here needs it, and
it pulls in many extra packages), a CSS framework, analytics, web fonts from Google, any CDN.

## Security headers (`dist/_headers`)

Generated by `src/integrations/security-headers.ts` after every build and applied by Cloudflare Pages.

| Header | What it does here |
|---|---|
| `Content-Security-Policy` | `default-src 'none'`, then only what the site uses: scripts, styles, images, fonts and the worker from this site only. Inline scripts are allowed **only** by their exact SHA-256 hash (computed from the built HTML), so injected code can't run. No `unsafe-inline`, no `unsafe-eval`. `frame-ancestors 'none'` stops other sites framing this one (clickjacking); `form-action 'none'` (there are no forms); `object-src 'none'`; `base-uri 'none'`; `upgrade-insecure-requests`. The build **fails** if it finds `onclick=` handlers or `style=""` attributes, which the policy would block. |
| `Strict-Transport-Security` | Browsers use HTTPS only for a year. No `preload`: that's a hard-to-undo commitment to make once `dayprism.app` is set up. |
| `X-Content-Type-Options: nosniff` | Browsers must trust the declared file type (stops "this image is actually a script" tricks). |
| `Referrer-Policy: strict-origin-when-cross-origin` | Other sites see only `dayprism.pages.dev`, never the full URL. |
| `Permissions-Policy` | Camera, microphone, geolocation, payment, USB, Bluetooth, screen capture and ad-topics are switched off. Motion sensors are allowed for this site only (the hero's tilt effect on phones). |
| `X-Frame-Options: DENY` | Older-browser version of `frame-ancestors 'none'`. |
| `Cross-Origin-Opener-Policy` / `-Resource-Policy: same-origin` | Isolates the site's window and files from other sites. |
| `/investors`: `X-Robots-Tag: noindex, nofollow`, `Cache-Control: private, no-store` | Search engines must not index it; shared caches must not keep it. |

The contact email is never in the HTML as text: the build encodes it and `contact.ts` assembles the
`mailto:` link in the browser. That stops simple scrapers, not a determined person with a browser.

## Deploy: Cloudflare Pages from the private GitHub repo

1. Commit and push the `website/` folder with GitHub Desktop (`node_modules/`, `dist/` and `.astro/`
   are git-ignored).
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**. Authorise
   the Cloudflare GitHub app for **only** this repository.
3. Settings:
   - Production branch: `main`
   - Framework preset: **Astro**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory (advanced): `website`
   - Environment variables: `NODE_VERSION` = `22`, `ASTRO_TELEMETRY_DISABLED` = `1`
4. **Save and Deploy.** The site appears at `https://<project-name>.pages.dev`. If the project name
   isn't `dayprism`, set `url` in `src/site.config.ts` to the real address and push again (it's used
   for canonical links, the sitemap and social previews).
5. Check headers: open the site, DevTools → Network → the page → Response Headers should include
   `content-security-policy`. Or <https://securityheaders.com>.
6. Every push to another branch gets its own preview URL. Pull requests show it automatically.

Later, with a domain: **Pages project → Custom domains → Set up a domain** (`dayprism.app`), then set
`url: 'https://dayprism.app'` in `site.config.ts`.

## Make `/investors` private with Cloudflare Access

The page has `noindex`, is in no sitemap and is linked from nowhere, **but none of that makes it
private**. Cloudflare Access does: visitors must prove they own an approved email address.

1. Cloudflare dashboard → **Zero Trust** (first time: pick a team name and the **Free** plan, up
   to 50 users; a card may be asked for but isn't charged on Free).
2. **Settings → Authentication → Login methods**: make sure **One-time PIN** is enabled.
3. **Access → Applications → Add an application → Self-hosted.**
   - Application name: `DayPrism investors`
   - Session duration: e.g. 24 hours
   - Public hostnames. Add **all** of these, so no copy of the page is left open:
     - Domain `<project>.pages.dev`, path `investors`
     - Domain `<project>.pages.dev`, path `investors.html`
     - Domain `*.<project>.pages.dev`, path `investors` (preview deployments; each has its own subdomain)
     - Domain `*.<project>.pages.dev`, path `investors.html`
     - Later: `dayprism.app` / `www.dayprism.app` with the same paths.
4. Add a policy: name `Approved investors`, action **Allow**, rule **Include → Emails →** each
   investor's address (and yours). Save.
5. Test in a private window: `/investors` must show the Cloudflare sign-in screen; an approved
   email receives a code; any other email is refused. Also test `/investors.html` and a preview URL.
6. To add or remove an investor later, edit the policy's email list. Nothing in the site changes.

Optional but recommended: **Pages project → Settings → General → Access policy → Enable**. This
puts every preview deployment behind Access too, so unreleased work isn't public.

## Quality checks before a release

- `npm run build` (includes the type check) and `npm audit` are clean.
- `npm run preview`, then Chrome DevTools → Lighthouse → Mobile on `/`, `/privacy`, `/terms`,
  `/delete-account`; Console shows no errors or CSP violations.
- Toggle the theme, try `?sky=low`, and turn on "reduce motion" in your OS: all must look finished.
