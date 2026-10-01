// The "medium" hero for phones, tablets and modest laptops: the sky shader in plain WebGL, with
// the painted town and shader-lit windows. A few KB, no React or three.js.
// Where the browser allows (OffscreenCanvas), all WebGL work runs in a worker, so the page itself
// never waits for it; otherwise it runs here, on the main thread.
import { currentTheme, listen, markDead, markLive, reduceMotion } from './dom';
import { createRenderer, type Renderer } from './renderer';
import { live, setTheme, tick } from './timeline';
import type { ToWorker } from './sky-worker';

const RESOLUTION = () => Math.min(devicePixelRatio, 1) * 0.75; // fewer pixels: cheap, and the sky is soft

export function mount(stage: HTMLElement) {
  const canvas = document.createElement('canvas');
  stage.append(canvas);
  const rising = !!window.prismSky?.rising;
  const riseStart = window.prismSky?.start ?? 0;

  if ('transferControlToOffscreen' in canvas && typeof Worker === 'function') {
    const worker = new Worker(new URL('./sky-worker.ts', import.meta.url), { type: 'module' });
    const send = (m: ToWorker, transfer: Transferable[] = []) => worker.postMessage(m, transfer);
    worker.onmessage = (e: MessageEvent<{ type: 'live' | 'failed' }>) => {
      if (e.data.type === 'live') markLive();
      else { markDead(); worker.terminate(); canvas.remove(); }
    };
    worker.onerror = () => { markDead(); canvas.remove(); };
    const offscreen = canvas.transferControlToOffscreen();
    send({ type: 'init', canvas: offscreen, reduceMotion, theme: currentTheme(), riseStartEpoch: rising ? performance.timeOrigin + riseStart : null }, [offscreen]);
    listen(stage, {
      layout: (l, mask) => createImageBitmap(mask).then((bitmap) => send({ type: 'layout', ...l, scale: RESOLUTION(), mask: bitmap }, [bitmap])),
      theme: (theme) => send({ type: 'theme', theme }),
      risen: () => send({ type: 'risen' }),
      scroll: (value) => send({ type: 'scroll', value }),
      pointer: (x, y) => send({ type: 'pointer', x, y }),
      running: (on) => send({ type: 'running', on }),
    });
    return;
  }

  // Main-thread fallback (older browsers without OffscreenCanvas).
  live.reduceMotion = reduceMotion;
  live.theme = currentTheme();
  live.rising = rising;
  live.riseStart = riseStart;
  let renderer: Renderer | null = null;
  let running = false;
  let frame = 0;
  let last = 0;
  let first = true;
  const draw = (now: number) => {
    frame = 0;
    if (!renderer || !running) return;
    if (!first && now - last < 30) { frame = requestAnimationFrame(draw); return; }
    const animating = tick(now, (now - last) / 1000);
    last = now;
    renderer.draw();
    if (first) { first = false; markLive(); }
    if (!reduceMotion || animating) frame = requestAnimationFrame(draw);
  };
  const wake = () => { if (!frame && running) frame = requestAnimationFrame(draw); };
  let pending: (() => void) | null = null;

  createRenderer(canvas, () => document.createElement('canvas'), (r) => { renderer = r; pending?.(); wake(); }, () => { markDead(); canvas.remove(); });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); running = false; markDead(); });
  listen(stage, {
    layout: (l, mask) => {
      const apply = () => {
        Object.assign(live, { width: l.width, height: l.height, sunTarget: l.sunTarget, moonTarget: l.moonTarget, moonR: l.moonR, townRect: l.townRect });
        renderer!.resize(l.width * RESOLUTION(), l.height * RESOLUTION());
        renderer!.setMask(mask);
        wake();
      };
      if (renderer) apply(); else pending = apply;
    },
    theme: (theme) => { setTheme(theme, performance.now()); wake(); },
    risen: () => { live.rising = false; wake(); },
    scroll: (value) => { live.scroll = value; wake(); },
    pointer: (x, y) => { live.pointerTarget = { x, y }; },
    running: (on) => { running = on; if (on) wake(); else if (frame) { cancelAnimationFrame(frame); frame = 0; } },
  });
}
