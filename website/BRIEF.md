# DayPrism website: build brief

> Copy everything below the line into a new chat (or hand it to a designer or developer). It's
> written to be complete: it says what to build, how it should look and feel, what every section
> says, and the quality bar it must meet.

---

## 1. Who we are and what the site must do

**DayPrism** is an Android app (iOS later) that helps people understand what makes their days good
or hard. You log sleep, meals, caffeine, water, energy, mood and activities in seconds. DayPrism then
shows the patterns: why Tuesday felt flat, what your best days have in common. It is private by
design: encrypted on the phone, no ads, no data selling. Admins can't read anyone's entries.

**The name:** a prism splits plain light into its colours. **DayPrism** splits your ordinary day
into what it's really made of (sleep, food, mood, energy) and shows you the patterns.
**Tagline: "See the colours of your day."** (The name was changed from DayPrism, which was already
taken on Google Play.)
Light is the whole visual idea of the brand: sunrise for the day, moonlight for the night, and a
prism that turns plain light into colours.

The site has three jobs:
1. **Make people want the app at first glance**, and get them to the Play Store page.
2. **Make investors believe in it**, through a separate private page (section 9).
3. **Host the legal pages** the Play Store requires (privacy policy and terms).

**Audience:** everyday people worldwide, many on mid-range Android phones and patchy mobile data,
and investors on laptops. Both must be impressed. Neither can be made to wait.

---

## 2. The quality bar

It must **not** look like a template, a typical AI-generated landing page or a "vibe-coded" site.
That means:
- no generic purple gradients with floating blobs,
- no stock illustrations or stock-photo people,
- no "Revolutionize your wellness journey ✨" copy,
- no fake testimonials, fake user counts, fake ratings or fake press logos.

It must feel like a **premium, finished product**, in the class of Apple product pages, Linear,
Stripe or Arc: few words, confident typography, one big idea per screen, and motion that means
something.

**Honesty is part of the brand.** Every claim on the site must be true today. Anything not yet
shipped is clearly labelled "Coming soon". This is also a Play Store and consumer-law requirement.

---

## 3. Technology (stable and future-proof, not a one-off page)

| Piece | Choice | Why |
|---|---|---|
| Framework | **Astro 5** with TypeScript | Sends almost no JavaScript by default, so it's fast on cheap phones. Pages are static HTML with interactive "islands" only where needed. Easy to add a blog, changelog or other languages later. |
| Interactive parts | **React** islands | For the 3D scene, theme switch and phone demo. |
| 3D and light | **Three.js** via **@react-three/fiber** + **@react-three/drei**, custom GLSL shaders | Real-time sun rays, sky and moonlit city, rather than video or GIF. |
| Motion | **GSAP** + ScrollTrigger (or Motion One) | Scroll-driven storytelling, smooth on mobile. |
| Styling | Plain modern CSS with design tokens (custom properties, `clamp()`, container queries); no CSS framework | Full control, nothing template-looking, small output. |
| Content | Astro content collections (Markdown) | Copy, FAQ and legal pages are editable without touching code. |
| Hosting | **Cloudflare Pages** (free) connected to the private GitHub repo | Global CDN, HTTPS, preview links for every change, works with private repos. |
| Domain | `dayprism.app` later (about $15/year) | The site works on the free `*.pages.dev` address until then. |
| Analytics | None at launch. Optionally **Cloudflare Web Analytics** (cookieless, no personal data) | A privacy app must not track its visitors. **No cookie banner should ever be needed.** |

The code lives in `website/` in the DayPrism repository. It needs a README that explains how to run,
build and deploy it.

### About "GIF backgrounds"
Use **live WebGL light (shaders)** instead of GIFs. GIFs are huge (several MB), low quality (256
colours, visible banding in gradients) and can't respond to scroll or theme. A shader looks better,
weighs a few KB and reacts to the visitor. Where a pre-rendered loop is genuinely better, use a
short, muted **WebM/MP4** (under 1.5 MB, with a poster image), never a GIF.

---

## 4. The signature experience

### 4.1 Entrance: "the sun rises on the page" (light theme)
1. The page opens in **pre-dawn**: a deep indigo sky (`#0b1020` to `#1a1f3a`) with a faint horizon
   glow. Only the outline of the DayPrism wordmark is visible.
2. Over about 2.5 seconds, **the sun rises behind the wordmark**:
   - Volumetric **god rays** (radial-blur shader) fan out from behind the letters.
   - The sky warms through violet → rose → amber → soft morning blue.
   - The wordmark fills with light from bottom to top, like dawn reaching it.
3. As the light spreads, **the page itself "lights up"**: the navigation, headline and buttons fade
   in where the rays touch them, as if the sun is revealing them.
4. The rays keep drifting slowly (subtle parallax with the pointer on desktop and the gyroscope on
   phones, if allowed). They never loop visibly.
5. Scrolling down moves the sun higher. The sky settles into the clean light theme so the content
   is calm and readable.
6. **As you scroll on, the sunrise's light passes through a prism and turns into colours** (the
   "What the name means" section, section 6 item 2): a beam slants down from the sky into a glass
   prism and fans out into coloured rays, one for each part of the day.
7. **Skip rules:**
   - The entrance plays once per visit (remembered for the session).
   - Any scroll, click or key press completes it instantly.
   - With `prefers-reduced-motion`, show the final lit state with no animation.

### 4.2 Dark theme: "moonlight over a sleeping town"
- The theme switch is a small **sun/moon dial** in the navigation. Pressing it makes the sun set
  along an arc and the moon rise.
- The hero becomes a **stylised low-poly town and city skyline at night**:
  - Original geometry, not a stock model.
  - The moon is behind it, with a soft moonlight bloom and cool rim light on rooftops.
  - A few stars twinkle.
- As the moon rises, **windows light up one by one across the town**: the "everyone's day is
  ending" moment. This is the dark-mode equivalent of the sunrise.
- Switching back plays a sunrise over the same town (the windows go out as daylight arrives).
- The theme follows the visitor's system setting on first visit. A manual choice is remembered in
  `localStorage`, and the page never flashes the wrong theme on load.

### 4.3 Motion principles
- Motion explains, never decorates: light reveals content, and things move the way light does
  (slow, soft, from a source).
- 60 fps target. Animate only `transform`, `opacity` and shader uniforms.
- Pause all WebGL when the tab is hidden or the scene is off-screen.

### 4.4 Graceful fallbacks (essential: we serve people on cheap phones)
- Choose the right level from device memory, GPU and `navigator.connection.saveData`:
  - **High:** full 3D, rays and city.
  - **Medium:** fewer rays, lower resolution, no city geometry. Use a painted city silhouette with
    shader-lit windows instead.
  - **Low or no WebGL:** a beautiful static gradient sunrise or moonlight image (AVIF/WebP), still
    on-brand.
- Load the 3D after the first paint, so the text is readable immediately.

---

## 5. Brand system

### Colours (match the app)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--sky` | `#f4f6fa` | `#0b1020` | page background |
| `--surface` | `#ffffff` | `#151b2e` | cards |
| `--ink` | `#0f172a` | `#f1f5f9` | text |
| `--ink-2` | `#475569` | `#94a3b8` | secondary text |
| `--brand` | `#2a78d6` | `#5598e7` | links, primary buttons |
| `--brand-2` | `#4a3aa7` | `#7c6cf0` | gradient partner |
| `--sun` | `#ff9a3c` | n/a | sunrise, streak |
| `--sun-deep` | `#e8505b` | n/a | sunrise edge |
| `--moon` | n/a | `#dfe7ff` | moonlight |
| `--window` | n/a | `#ffd27a` | lit windows |

All text must meet **WCAG AA contrast** in both themes.

### Typography
- **Plus Jakarta Sans** (same as the app), self-hosted and subset; no Google Fonts call, for
  privacy and speed.
- Big, tight display headings (`clamp(2.5rem, 6vw, 5.5rem)`, weight 800, slight negative
  tracking) and generous body text (18 px on desktop, 16 px on phones).

### Logo
Use the app's mark: a small sun with rays shining into a prism, with three colour rays of
different lengths coming out (yellow `#ffd166`, orange `#ff9a3c`, pink `#ff6b8b`) on a blue
`#2a78d6` tile. Take the exact SVG geometry from `dayprism-v1/src/ui/logo.tsx` and the icons from
`dayprism-v1/assets/`. The animated wordmark in the hero is "DayPrism" set in the display weight.

### Voice
Warm, plain, confident. Short sentences. Speak to one person ("you"). No hype words
("revolutionary", "game-changing", "unlock").

---

## 6. Page structure and copy (home page `/`)

Each section is roughly one screen on desktop and stacks cleanly on phones. The copy below is a
strong first draft, so refine it but keep the meaning.

**1. Hero (the sunrise)**
- Wordmark: **DayPrism**
- Headline: **See the colours of your day.**
- Sub: *Log your day in seconds. See what makes your best ones. Private by design.*
- Buttons: **Get it on Google Play**, showing a "Coming soon" state for now (see section 8), and
  **See how it works ↓**.

**2. What the name means** (the sunrise turns into colours)
- Large: *A prism splits plain light into its colours.*
- Text: *DayPrism does the same with your day. It splits an ordinary day into what it's really
  made of (sleep, food, mood, energy) and shows you the patterns.*
- Visual: as you scroll, a beam of sunlight slants in from above (from the hero's sunrise),
  passes through a glass prism and fans out into coloured rays labelled Energy, Food, Mood and
  Sleep. Warm sunlight in the light theme, cool moonlight in the dark theme.

**3. The problem**
- Headline: *You can feel a bad day. You just can't see why.*
- Three short truths with subtle icons: tiredness has causes; patterns hide across weeks;
  most trackers are built for ads, not for you.

**4. How it works: Log → See → Understand** (scroll-pinned, with a 3D phone)
- A realistic **3D phone** (an original model; never use Apple or Samsung device marks) stays
  pinned while the screen changes as you scroll. Use real screenshots from the app.
  1. **Log in seconds.** Eight tiles you choose. One tap adds water; long-press repeats your usual
     coffee or meal.
  2. **See your day.** A timeline of everything, plus your streak.
  3. **Understand your patterns.** Insights such as how your sleep affects tomorrow's energy, or
     what your best days share. A weekly summary compares this week with last.

**5. Features grid** (cards that light up as the sun passes over them)
Only shipped features, each with a one-line benefit:
- **Your own Today screen**: 8 tiles you choose and arrange.
- **Home-screen widgets**: log from your home screen; a streak widget that glows when today is done.
- **Streaks and weekly summary**: gentle motivation, real progress.
- **Smart reminders**: they skip themselves when you've already logged.
- **Custom trackers**: medication, alcohol, stress, weight, anything.
- **Cycle tracking**: periods, symptoms and predictions, fully private and opt-in.
- **Health Connect**: brings in steps, sleep and workouts from your watch or other apps.
- **Works offline, syncs when online**: your phone is the source of truth.
- **Coming soon (labelled clearly):** nutrition (calories, protein, vitamins and minerals from
  what you ate, including home-cooked dishes), iPhone app, DayPrism Plus.

**6. Privacy: the trust section** (in dark mode; reuse the moonlit town)
- Headline: *Your days are yours.*
- Visual: a day's entries fold into a glowing locked "vault" (encryption shown, not just stated).
- Points, all true today:
  - Your diary is **encrypted on your phone** (SQLCipher, 256-bit AES).
  - **No ads. No data selling. No third-party trackers.**
  - **Even we can't read your entries.** Admin tools show account counts only.
  - Optional **app lock** with fingerprint, face or PIN.
  - **Export or delete everything**, any time, from the app.
- Link: *Read our privacy policy →*

**7. Why DayPrism is different** (a calm comparison, not an attack)
A clean table: **DayPrism** vs **typical habit trackers** vs **typical health apps**. Rows:
connects sleep, food, caffeine and mood · shows *why* · no ads · encrypted diary · works offline ·
free core features. Compare against categories, not named competitors, and keep every cell factual.

**8. Pricing**
- **Free, forever:** all logging, widgets, reminders, streaks, sync and core insights.
- **DayPrism Plus (coming soon):** deeper insights and extras, at an affordable regional price.
  Show no price until it's decided.
- Line: *No ads, ever. If you can't afford Plus, DayPrism still works fully.*

**9. From the founder**
- A portrait or a simple illustrated initial: a placeholder until a photo is supplied.
- Draft (to be personalised by the founder):
  *"I didn't start with a big office or a big budget. I come from the ground up, from long days,
  little sleep and figuring things out on my own. I built DayPrism for people like the ones I grew
  up with: people who can't pay for coaches or premium apps but deserve to understand their own
  days just as much. That's why the core of DayPrism is free, has no ads and keeps your data
  yours."*
  — [Founder name], Founder
- Use placeholders for the name and photo and leave the wording editable in a content file.
  **Never invent biographical facts.**

**10. FAQ** (accessible accordion)
- Is DayPrism free? · Is my data safe? · Can you see my entries? · Does it work offline? · Which
  phones? (Android 8+, iPhone coming) · Is it medical advice? (No: it's a personal diary and
  insights, not a medical device) · How do I delete my account?

**11. Final call to action** (the sun low and golden, about to set)
- *Start seeing your days clearly.* · **Get it on Google Play**, in its "Coming soon" state.

**Footer:** logo · Privacy · Terms · Contact · © 2026 DayPrism · *Made with care for people
everywhere.*

---

## 7. Other pages
- **`/privacy`** and **`/terms`**: the full texts, taken from the app (`dayprism-v1/PRIVACY.md`
  and `TERMS.md`). Readable layout, a table of contents and the "last updated" date. **These URLs
  go into the Play Console**, so they must be stable.
- **`/delete-account`**: the steps to delete an account and its data. Google Play requires a public
  page for this.
- **`404`**: a lost-in-the-dark page: a small lantern lights up the "Back home" link.

---

## 8. Play Store button and contact
- Use the **official "Get it on Google Play" badge**, following Google's brand guidelines. Until the
  listing is live:
  - Show it in a muted state with a **"Coming soon"** ribbon.
  - Make it non-clickable, or link it to a short "Notify me" note that says to watch this page.
  - Collect **no emails** (no backend, no personal data).
- Keep the store URL in one config value (`PLAY_STORE_URL`), empty for now. When the app is
  published, filling it in switches every badge to live.
- **Contact:** prithviram19@gmail.com.
  - Show it as a `mailto:` link.
  - Obfuscate it in the HTML (assemble it in JavaScript, or encode it) so spam bots can't scrape
    it easily.
  - It's set in one config value so it can later change to a `hello@dayprism.app` address.

---

## 9. Private investor page (`/investors`)
- **Not linked anywhere** on the public site.
- `<meta name="robots" content="noindex, nofollow">`, and excluded from the sitemap.
- **Truly private:** protect it with **Cloudflare Access** (free for up to 50 people). Investors
  enter their email and get a one-time code. Only addresses you approve get in. **Don't rely on a
  "secret URL" or a password written in JavaScript**: those are not private.
- Same design language, more depth:
  1. **The opportunity:** people want to understand their energy, sleep and mood. Existing apps
     are fragmented, ad-funded or expensive.
  2. **The product today:** what's shipped (version 1.6), with screenshots. State real numbers
     only, e.g. "in closed testing"; **never invent traction**.
  3. **What makes it different:** it connects everything, explains *why*, is private by
     architecture, and the free core works offline on cheap phones.
  4. **Business model:** freemium + DayPrism Plus, no ads, regional pricing. The goal is
     sustainability and reach.
  5. **Roadmap:**
     - Phase 1: Android launch.
     - Phase 2: iPhone and Apple Health.
     - Phase 3: personal energy forecast, experiments, more languages.
     - Nutrition is in beta.
  6. **The founder** (the same story, longer).
  7. **The ask:** a placeholder section the founder fills in.
  8. **Contact.**

---

## 10. Responsive and accessible
- Test at **360, 390, 768, 1024, 1440 and 1920 px** wide, in portrait and landscape. No horizontal
  scrolling, ever. Tap targets at least 44 px.
- On phones: the 3D phone becomes a swipeable sequence of screens; the comparison table becomes
  stacked cards; the sunrise still plays (at the medium or low level).
- **WCAG 2.2 AA**:
  - semantic landmarks and keyboard access everywhere, with visible focus rings;
  - descriptive alt text; the 3D canvas has an `aria-label` and a text equivalent;
  - every animation respects `prefers-reduced-motion`;
  - the theme toggle has an accessible name and state.

## 11. Performance budget (measured on a mid-range Android over 4G)
- **Largest Contentful Paint < 2.0 s · Cumulative Layout Shift < 0.05 · Interaction to Next Paint < 200 ms.**
- Lighthouse **95+** in Performance, Accessibility, Best Practices and SEO, on mobile.
- Initial JS **< 120 KB** gzipped before the 3D loads. The 3D bundle loads lazily (< 350 KB gzipped).
- Images in AVIF/WebP with explicit sizes. Fonts subset and preloaded.

## 12. Security and privacy of the site itself
- Static site: no server, no database, no forms that store data.
- Security headers via Cloudflare `_headers`:
  - a strict **Content-Security-Policy** (no inline scripts; hashes if needed);
  - `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
    strict-origin-when-cross-origin`, `Permissions-Policy` (deny camera, microphone and
    geolocation).
- No third-party scripts, fonts or embeds at runtime. Dependencies pinned, with
  `npm audit` clean before each deploy.
- **No secrets in the repo.** The site needs none: the Supabase keys are not used by the website.

## 13. SEO and sharing
- Title and description per page, canonical URLs, `sitemap.xml` and `robots.txt` (excluding
  `/investors`).
- An Open Graph and Twitter card image (1200×630): dawn light passing through a prism into colours,
  under the name and tagline.
- JSON-LD `SoftwareApplication` markup (Android, free, category Health & Fitness). No fake ratings.
- A favicon set and web manifest from the app icon.

## 14. Deliverables and definition of done
1. The Astro project in `website/`, with a README: `npm install`, `npm run dev`, `npm run build`,
   and step-by-step Cloudflare Pages setup through the GitHub integration.
2. All pages above, with copy in content files and every config value (store URL, contact email,
   founder name and photo) in one `site.config.ts`.
3. The sunrise entrance, sun/moon theme switch with the moonlit town, scroll story and 3D phone,
   all with fallback levels.
4. A checklist showing each item below passing:
   - Lighthouse mobile 95+ on every page;
   - axe accessibility scan clean;
   - tested on Chrome Android, Safari iOS, Chrome, Firefox and Edge desktop;
   - reduced-motion mode verified;
   - no console errors;
   - CSP active with no violations.
5. Real app screenshots (no mock data that implies features we don't have).

**Don't:** use GIFs for backgrounds; use stock photos; invent testimonials, numbers or press; add
tracking or cookies; link the investor page publicly; claim unreleased features as available; or
put any key or secret in the code.
