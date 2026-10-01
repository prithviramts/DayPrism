/**
 * The sleeping town, generated from a fixed seed so it's identical on every build and device.
 *
 * One description is drawn three ways:
 *  - as an SVG silhouette (low-power fallback, privacy section): see townSvg()
 *  - as a painted texture with shader-lit windows (medium WebGL level)
 *  - as low-poly 3D geometry (high WebGL level)
 *
 * Coordinates: x 0..WIDTH left to right, y 0..HEIGHT from the ground up.
 */
export const WIDTH = 1600;
export const HEIGHT = 420;

export type Roof = 'flat' | 'gable' | 'spire';
export interface Building { x: number; w: number; h: number; roof: Roof; roofH: number; layer: 0 | 1 | 2 }
export interface Window { x: number; y: number; w: number; h: number; layer: 0 | 1 | 2; order: number }
export interface Town { buildings: Building[]; windows: Window[] }

/** Small deterministic random number generator (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lower in the middle, taller at the edges, so the headline and buttons stay clear. */
const valley = (x: number) => 0.55 + 0.45 * Math.pow(Math.abs(x / WIDTH - 0.5) * 2, 1.4);

export function generateTown(seed = 7): Town {
  const r = rng(seed);
  const buildings: Building[] = [];
  const windows: Window[] = [];
  const between = (a: number, b: number) => a + (b - a) * r();

  const addWindows = (b: Building, cols: number, rows: number, top: number, bottom: number, ww: number, wh: number) => {
    const span = b.w * 0.72;
    const left = b.x + (b.w - span) / 2;
    const stepX = cols > 1 ? (span - ww) / (cols - 1) : 0;
    const stepY = rows > 1 ? (top - bottom - wh) / (rows - 1) : 0;
    for (let c = 0; c < cols; c++) {
      for (let row = 0; row < rows; row++) {
        // Over a third of windows stay dark all night (a calm town, not an office block); the rest
        // light up in a loose left-to-right wave.
        const dark = r() < 0.4;
        const x = cols > 1 ? left + c * stepX : b.x + b.w / 2 - ww / 2;
        const order = dark ? 2 : Math.min(0.999, (x / WIDTH) * 0.62 + r() * 0.38);
        windows.push({ x, y: bottom + row * stepY, w: ww, h: wh, layer: b.layer, order });
      }
    }
  };

  // Back layer: towers.
  for (let x = -20; x < WIDTH; ) {
    const w = between(46, 96);
    const h = between(170, 330) * valley(x + w / 2);
    const roof: Roof = r() < 0.22 ? 'spire' : 'flat';
    const b: Building = { x, w, h, roof, roofH: roof === 'spire' ? between(18, 40) : 0, layer: 0 };
    buildings.push(b);
    addWindows(b, Math.max(2, Math.round(w / 30)), Math.max(2, Math.round(h / 46)), h - 18, 26, 5, 7);
    x += w + between(4, 26);
  }
  // Middle layer: apartment blocks.
  for (let x = -30; x < WIDTH; ) {
    const w = between(70, 140);
    const h = between(84, 170) * (0.75 + 0.25 * valley(x + w / 2));
    const b: Building = { x, w, h, roof: 'flat', roofH: 0, layer: 1 };
    buildings.push(b);
    addWindows(b, Math.max(2, Math.round(w / 38)), Math.max(1, Math.round(h / 42)), h - 18, 22, 7, 9);
    x += w + between(0, 34);
  }
  // Front layer: small houses with pitched roofs.
  for (let x = -10; x < WIDTH; ) {
    const w = between(52, 92);
    const h = between(38, 62);
    const b: Building = { x, w, h, roof: 'gable', roofH: between(22, 36), layer: 2 };
    buildings.push(b);
    addWindows(b, r() < 0.65 ? 1 : 2, 1, h - 12, h - 30, 10, 12);
    x += w + between(8, 40);
  }
  return { buildings, windows };
}

/** SVG path data for one layer's silhouettes (y flipped: SVG y grows downwards). */
export function layerPath(town: Town, layer: 0 | 1 | 2): string {
  const Y = (y: number) => (HEIGHT - y).toFixed(1);
  return town.buildings
    .filter((b) => b.layer === layer)
    .map((b) => {
      const l = b.x.toFixed(1);
      const rt = (b.x + b.w).toFixed(1);
      if (b.roof === 'gable') {
        const mid = (b.x + b.w / 2).toFixed(1);
        const eave = 4;
        return `M${(b.x - eave).toFixed(1)} ${Y(b.h)}L${mid} ${Y(b.h + b.roofH)}L${(b.x + b.w + eave).toFixed(1)} ${Y(b.h)}L${rt} ${Y(b.h)}L${rt} ${Y(0)}L${l} ${Y(0)}L${l} ${Y(b.h)}Z`;
      }
      if (b.roof === 'spire') {
        const mid = b.x + b.w / 2;
        return `M${l} ${Y(0)}L${l} ${Y(b.h)}L${(mid - 2).toFixed(1)} ${Y(b.h)}L${mid.toFixed(1)} ${Y(b.h + b.roofH)}L${(mid + 2).toFixed(1)} ${Y(b.h)}L${rt} ${Y(b.h)}L${rt} ${Y(0)}Z`;
      }
      return `M${l} ${Y(0)}L${l} ${Y(b.h)}L${rt} ${Y(b.h)}L${rt} ${Y(0)}Z`;
    })
    .join('');
}

/**
 * One layer's lit windows, grouped into 12 buckets by lighting order (CSS gives each bucket its
 * own delay). Drawn per layer so nearer buildings cover the windows of the ones behind them.
 */
export function windowBuckets(town: Town, layer: 0 | 1 | 2, buckets = 12): string[] {
  const groups: string[][] = Array.from({ length: buckets }, () => []);
  for (const w of town.windows) {
    if (w.order > 1 || w.layer !== layer) continue;
    const i = Math.min(buckets - 1, Math.floor(w.order * buckets));
    groups[i].push(`M${w.x.toFixed(1)} ${(HEIGHT - w.y - w.h).toFixed(1)}h${w.w}v${w.h}h${-w.w}Z`);
  }
  return groups.map((g) => g.join(''));
}
