// Scroll-driven motion for the home page, built on GSAP + ScrollTrigger. Loaded lazily, and never
// when the visitor prefers reduced motion: every section is complete and readable without it.
// Only transform and opacity are animated.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
document.documentElement.classList.add('motion');

// Fade-up for blocks that are still below the fold (anything already visible stays put).
const pending = gsap.utils.toArray<HTMLElement>('[data-reveal]').filter((el) => el.getBoundingClientRect().top > innerHeight);
gsap.set(pending, { opacity: 0, y: 28 });
ScrollTrigger.batch(pending, {
  start: 'top 88%',
  once: true,
  onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08 }),
});

// The name: the sunrise's light slants down into the prism, the glass lights up, and the beam
// fans out into coloured rays, one per part of the day. Driven by scrolling.
const prism = document.querySelector<HTMLElement>('[data-prism]');
if (prism) {
  const tl = gsap.timeline({ scrollTrigger: { trigger: prism.querySelector('.prism-fig'), start: 'top 85%', end: 'center 45%', scrub: 0.6 } });
  tl.fromTo('[data-beam]', { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, ease: 'none', duration: 0.35 }, 0)
    .fromTo('[data-glass]', { opacity: 0.35 }, { opacity: 1, ease: 'none', duration: 0.12 }, 0.3);
  const rays = gsap.utils.toArray<SVGGElement>('[data-ray]', prism);
  const mid = rays.reduce((sum, r) => sum + Number(r.dataset.angle), 0) / Math.max(1, rays.length);
  rays.forEach((ray, i) => {
    tl.fromTo(ray, { rotation: mid, scaleX: 0, transformOrigin: '0% 50%' }, { rotation: Number(ray.dataset.angle), scaleX: 1, ease: 'power2.out', duration: 0.4 }, 0.38 + i * 0.05);
  });
  tl.fromTo('[data-ray-label]', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.2, stagger: 0.05 }, 0.7);
}

// The phone turns gently as the steps go by (wide screens only).
const phone = document.querySelector<HTMLElement>('.how-wide [data-phone-body]');
if (phone && getComputedStyle(phone).display !== 'none') {
  gsap.set(phone, { rotationY: -18, rotationX: 7, rotationZ: 1 });
  gsap.to(phone, {
    rotationY: 12, rotationX: 3, rotationZ: -1, ease: 'none',
    scrollTrigger: { trigger: '.how-wide', start: 'top center', end: 'bottom center', scrub: 0.8 },
  });
}

// Features: a soft sun crosses the grid and each card lights up as it passes over.
const features = document.querySelector<HTMLElement>('[data-features]');
if (features) {
  const tl = gsap.timeline({ scrollTrigger: { trigger: features, start: 'top 75%', end: 'bottom 60%', scrub: 0.6 } });
  tl.fromTo('[data-sunpass]', { x: '-10vw', opacity: 0 }, { x: '110vw', opacity: 1, ease: 'none', duration: 1 }, 0);
  tl.to('[data-sunpass]', { opacity: 0, duration: 0.15 }, 0.85);
  const width = features.clientWidth || innerWidth;
  for (const card of gsap.utils.toArray<HTMLElement>('[data-feature]')) {
    const r = card.getBoundingClientRect();
    const f = Math.min(0.9, Math.max(0.05, (r.left + r.width / 2) / width));
    const light = card.querySelector('.feature-light');
    tl.to(light, { opacity: 1, duration: 0.1, ease: 'sine.out' }, f - 0.08).to(light, { opacity: 0.45, duration: 0.2, ease: 'sine.in' }, f + 0.06);
  }
}

// Privacy: every value starts readable. Each row scrambles into ciphertext only as it passes the
// middle of the screen, so you always read what it was before you see it encrypted. The lock
// closes when the last row gets there. The labels never move.
const vault = document.querySelector<HTMLElement>('[data-vault]');
if (vault) {
  const rows = gsap.utils.toArray<HTMLElement>('[data-vault-row]', vault);
  gsap.set(vault.querySelectorAll('[data-plain]'), { opacity: 1 });
  gsap.set(vault.querySelectorAll('[data-cipher]'), { opacity: 0 });
  gsap.set('[data-shackle]', { y: -7 });
  for (const row of rows) {
    gsap.timeline({ scrollTrigger: { trigger: row, start: 'center 52%', end: 'center 42%', scrub: 0.4 } })
      .to(row.querySelector('[data-plain]'), { opacity: 0, x: -6, duration: 0.5 }, 0)
      .fromTo(row.querySelector('[data-cipher]'), { opacity: 0, x: 6 }, { opacity: 1, x: 0, duration: 0.5 }, 0.25);
  }
  gsap.timeline({ scrollTrigger: { trigger: rows[rows.length - 1], start: 'center 45%', end: 'center 38%', scrub: 0.4 } })
    .to('[data-shackle]', { y: 0, ease: 'back.out(3)' }, 0)
    .to('[data-vault-glow]', { opacity: 1, scale: 1.08 }, 0);
}

// Final call to action: the sun sinks a little as you reach the end of the page.
gsap.to('.low-sun', { yPercent: 18, ease: 'none', scrollTrigger: { trigger: '.final', start: 'top bottom', end: 'bottom bottom', scrub: true } });
