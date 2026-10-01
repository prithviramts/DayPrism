// The hero's timeline: given the inputs (theme, entrance, scroll, pointer, layout), works out
// where the sun and moon are and how lit the town is. Pure logic with no DOM, so it runs the same
// on the main thread and inside the sky worker.

export type Theme = 'light' | 'dark';
const ENTRANCE_MS = 2500;
const THEME_MS = 2600;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Inputs, kept up to date by the page. Times are performance.now() of the realm running tick(). */
export const live = {
  reduceMotion: false,
  theme: 'light' as Theme,
  tween: null as null | { to: Theme; start: number },
  rising: false,
  riseStart: 0,
  pointer: { x: 0, y: 0 },
  pointerTarget: { x: 0, y: 0 },
  scroll: 0,
  sunTarget: { x: 0.5, y: 0.6 },
  moonTarget: { x: 0.8, y: 0.8 },
  /** Moon radius as a fraction of the hero height (smaller when space is tight). */
  moonR: 0.05,
  /** The painted town's rectangle in uv: x, y (bottom-left), width, height. */
  townRect: [0, 0, 1, 0.3] as [number, number, number, number],
  /** CSS pixels per town unit (matches the SVG's preserveAspectRatio="xMidYMax slice"). */
  townScale: 1,
  width: 1,
  height: 1,
};

/** Outputs for the shaders. */
export const state = {
  time: 0, dawn: 1, night: 0, rise: 1, windows: 0, dayness: 1,
  sunX: 0.5, sunY: 0.6, moonX: 0.8, moonY: 0.8, moonR: 0.05, sunR: 0.07, rayStrength: 0.4,
};

export function setTheme(theme: Theme, now: number) {
  if (theme === live.theme) return;
  live.theme = theme;
  live.tween = live.reduceMotion ? null : { to: theme, start: now };
  live.rising = false;
}

/** Advances the timeline. Returns true while something is still changing. */
export function tick(now: number, delta: number): boolean {
  live.pointer.x += (live.pointerTarget.x - live.pointer.x) * Math.min(1, delta * 2.5);
  live.pointer.y += (live.pointerTarget.y - live.pointer.y) * Math.min(1, delta * 2.5);
  state.time = live.reduceMotion ? 0 : now / 1000;

  const raw = live.rising ? clamp01((now - live.riseStart) / ENTRANCE_MS) : 1;
  if (raw >= 1) live.rising = false;
  const e = easeOut(raw);
  const dark = live.theme === 'dark';
  let night = dark ? 1 : 0;
  let windows = dark ? 1 : 0;
  let moonP = dark ? 1 : 0;
  let dawn = 1;

  if (raw < 1) {
    if (dark) { moonP = e; windows = clamp01((raw - 0.2) / 0.75); }
    else { dawn = raw; windows = 0.8 * (1 - smooth(0.3, 0.85, raw)); }
  }
  if (live.tween) {
    const p = clamp01((now - live.tween.start) / THEME_MS);
    const toDark = live.tween.to === 'dark';
    const k = easeInOut(p);
    night = toDark ? k : 1 - k;
    moonP = toDark ? easeOut(clamp01(p * 1.15)) : 1 - easeInOut(p);
    windows = toDark ? clamp01((p - 0.3) / 0.7) : 1 - clamp01(p / 0.75);
    if (p >= 1) live.tween = null;
  }

  const s = live.scroll;
  const aspect = live.width / live.height;
  // Sun: rises to sit behind the wordmark, climbs as you scroll, sets along an arc at night.
  state.sunX = live.sunTarget.x + 0.24 * Math.sin((night * Math.PI) / 2) + live.pointer.x * 0.012;
  state.sunY = mix(-0.18, live.sunTarget.y, easeOut(dawn)) + s * 0.32 - 0.9 * Math.pow(night, 1.6) + live.pointer.y * 0.01;
  // Moon: rises along an arc from below the town to its spot beside or above the wordmark.
  state.moonX = mix(0.56, live.moonTarget.x, Math.sin((moonP * Math.PI) / 2));
  state.moonY = mix(-0.15, live.moonTarget.y, 1 - Math.pow(1 - moonP, 2)) + s * 0.1;

  state.dawn = dawn;
  state.night = night;
  state.rise = dark ? moonP : 1;
  state.windows = windows;
  state.dayness = (1 - night) * smooth(0.1, 0.9, dawn);
  state.rayStrength = mix(1.25, aspect < 1 ? 0.22 : 0.38, smooth(0.5, 1.0, dawn)) * (1 - s * 0.6);
  state.sunR = 0.068 * Math.min(1, aspect * 1.25);
  state.moonR = live.moonR;
  return live.tween !== null || live.rising;
}
