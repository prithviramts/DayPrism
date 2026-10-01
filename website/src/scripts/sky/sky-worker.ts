// The sky worker: draws the medium-level sky into an OffscreenCanvas on its own thread, so
// starting WebGL and drawing every frame never blocks taps or scrolling on the page.
// It receives the page's inputs as messages from lite.ts.
import { createRenderer, type Renderer } from './renderer';
import { live, setTheme, tick, type Theme } from './timeline';

export type ToWorker =
  | { type: 'init'; canvas: OffscreenCanvas; reduceMotion: boolean; theme: Theme; riseStartEpoch: number | null }
  | { type: 'layout'; width: number; height: number; scale: number; sunTarget: { x: number; y: number }; moonTarget: { x: number; y: number }; moonR: number; townRect: [number, number, number, number]; mask: ImageBitmap }
  | { type: 'theme'; theme: Theme }
  | { type: 'risen' }
  | { type: 'scroll'; value: number }
  | { type: 'pointer'; x: number; y: number }
  | { type: 'running'; on: boolean };

const post = (msg: { type: 'live' } | { type: 'failed' }) => (self as unknown as Worker).postMessage(msg);
const raf: (cb: (t: number) => void) => number = typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame
  : (cb) => setTimeout(() => cb(performance.now()), 33) as unknown as number;

let renderer: Renderer | null = null;
let running = false;
let scheduled = false;
let first = true;
let last = 0;
let pendingLayout: Extract<ToWorker, { type: 'layout' }> | null = null;

function frame(now: number) {
  scheduled = false;
  if (!renderer || !running) return;
  // 30 frames a second is plenty for slow light.
  if (!first && now - last < 30) { schedule(); return; }
  const animating = tick(now, (now - last) / 1000);
  last = now;
  renderer.draw();
  if (first) { first = false; post({ type: 'live' }); }
  if (!live.reduceMotion || animating) schedule();
}
function schedule() { if (!scheduled) { scheduled = true; raf(frame); } }

function applyLayout(m: Extract<ToWorker, { type: 'layout' }>) {
  Object.assign(live, { width: m.width, height: m.height, sunTarget: m.sunTarget, moonTarget: m.moonTarget, moonR: m.moonR, townRect: m.townRect });
  renderer!.resize(m.width * m.scale, m.height * m.scale);
  renderer!.setMask(m.mask);
  m.mask.close();
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      live.reduceMotion = m.reduceMotion;
      live.theme = m.theme;
      if (m.riseStartEpoch !== null) { live.rising = true; live.riseStart = m.riseStartEpoch - performance.timeOrigin; }
      createRenderer(m.canvas, () => new OffscreenCanvas(1, 1), (r) => {
        renderer = r;
        if (pendingLayout) applyLayout(pendingLayout);
        schedule();
      }, () => post({ type: 'failed' }));
      break;
    case 'layout':
      if (renderer) applyLayout(m);
      else { pendingLayout?.mask.close(); pendingLayout = m; }
      break;
    case 'theme': setTheme(m.theme, performance.now()); break;
    case 'risen': live.rising = false; break;
    case 'scroll': live.scroll = m.value; break;
    case 'pointer': live.pointerTarget = { x: m.x, y: m.y }; break;
    case 'running': running = m.on; break;
  }
  schedule();
};
