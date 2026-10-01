// The page side of the WebGL sky: measures the wordmark and town so the light lines up with the
// HTML, draws the wordmark as the light blocker for the rays, and listens to the page (theme,
// entrance, scroll, pointer, visibility). Shared by both renderers.
import { HEIGHT, WIDTH } from '../../lib/town';
import type { Theme } from './timeline';

const root = document.documentElement;
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const currentTheme = (): Theme => (root.dataset.theme === 'dark' ? 'dark' : 'light');
export const markLive = () => requestAnimationFrame(() => root.classList.add('sky-live'));
export const markDead = () => root.classList.remove('sky-live');

export interface Layout {
  width: number;
  height: number;
  sunTarget: { x: number; y: number };
  moonTarget: { x: number; y: number };
  moonR: number;
  townRect: [number, number, number, number];
  townScale: number;
}

/** Measures the hero and redraws `mask` (the wordmark, white on black, at quarter size). */
export function measure(stage: HTMLElement, mask: HTMLCanvasElement): Layout | null {
  const rect = stage.getBoundingClientRect();
  const wm = document.querySelector<HTMLElement>('[data-wordmark] .wm-base');
  const town = document.querySelector<SVGElement>('.hero-town');
  if (rect.width === 0 || !wm || !town) return null;

  const range = document.createRange();
  range.selectNodeContents(wm);
  const r = range.getBoundingClientRect();
  const sunTarget = { x: (r.left + r.width / 2 - rect.left) / rect.width, y: 1 - (r.top + r.height * 0.55 - rect.top) / rect.height };

  // The moon goes where it can't touch the wordmark: beside it if there's room, otherwise in the
  // gap between the navigation and the wordmark, shrunk to fit.
  const H = rect.height;
  const navBottom = 76;
  const glyphTop = r.top - rect.top + r.height * 0.18; // the line box starts above the letters
  const right = r.right - rect.left;
  let moonTarget: { x: number; y: number };
  let moonPx = 0.05 * H;
  if (rect.width - right > moonPx * 3.2) {
    moonTarget = { x: (right + (rect.width - right) / 2) / rect.width, y: 1 - (glyphTop + moonPx) / H };
  } else {
    moonPx = Math.max(12, Math.min(moonPx, (glyphTop - navBottom) / 2 - 8));
    moonTarget = { x: 0.8, y: 1 - (navBottom + (glyphTop - navBottom) / 2) / H };
  }
  const moonR = moonPx / H;

  const q = 0.25; // quarter resolution is plenty for soft rays
  mask.width = Math.max(2, Math.round(rect.width * q));
  mask.height = Math.max(2, Math.round(rect.height * q));
  const ctx = mask.getContext('2d')!;
  const size = parseFloat(getComputedStyle(wm).fontSize) * q;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, mask.width, mask.height);
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${size}px "Plus Jakarta Sans", sans-serif`;
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${size * -0.05}px`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(wm.textContent ?? 'DayPrism', (r.left + r.width / 2 - rect.left) * q, (r.top + r.height / 2 - rect.top) * q);

  const tr = town.getBoundingClientRect();
  const townScale = Math.max(tr.width / WIDTH, tr.height / HEIGHT); // = preserveAspectRatio="xMidYMax slice"
  const w = (WIDTH * townScale) / rect.width;
  const h = (HEIGHT * townScale) / rect.height;
  return { width: rect.width, height: rect.height, sunTarget, moonTarget, moonR, townRect: [(1 - w) / 2, (rect.bottom - tr.bottom) / rect.height, w, h], townScale };
}

export interface PageEvents {
  layout(l: Layout, mask: HTMLCanvasElement): void;
  theme(t: Theme): void;
  risen(): void;
  scroll(value: number): void;
  pointer(x: number, y: number): void;
  running(on: boolean): void;
}

/** Listens to the page and reports everything the sky needs through `on`. */
export function listen(stage: HTMLElement, on: PageEvents) {
  const mask = document.createElement('canvas');
  // Coalesce: fonts loading, the first ResizeObserver call and real resizes measure once a frame.
  let queued = false;
  const remeasure = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; const l = measure(stage, mask); if (l) on.layout(l, mask); });
  };
  remeasure();
  document.fonts?.ready.then(remeasure);
  new ResizeObserver(remeasure).observe(stage);

  // Pause whenever the hero is off-screen or the tab is hidden.
  let visible = true;
  const apply = () => on.running(visible && !document.hidden);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; apply(); }).observe(stage);
  document.addEventListener('visibilitychange', apply);

  addEventListener('prism:theme', (e) => on.theme((e as CustomEvent<{ theme: Theme }>).detail.theme));
  addEventListener('prism:risen', () => on.risen());

  const onScroll = () => on.scroll(Math.min(1, Math.max(0, scrollY / Math.max(1, stage.clientHeight))));
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (!reduceMotion) {
    addEventListener('pointermove', (e) => on.pointer((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1)), { passive: true });
    addEventListener('deviceorientation', (e) => {
      if (e.gamma == null || e.beta == null) return;
      on.pointer(Math.max(-1, Math.min(1, e.gamma / 30)), Math.max(-1, Math.min(1, (e.beta - 45) / 30)));
    }, { passive: true });
  }
}
