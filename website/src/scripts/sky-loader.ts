// Picks the hero's quality level for this device and, if it's worth it, loads the WebGL scene
// after the page has finished loading. The CSS sky is already on screen, so nothing waits on this.
//   high   full 3D town and rays (desktops and strong devices), React Three Fiber
//   medium fewer rays, lower resolution, painted town (phones, tablets, modest laptops), plain WebGL
//   low    no WebGL: the CSS gradient sky and SVG town stay (Save-Data, very low memory, no WebGL)
// Add ?sky=high|medium|low to the URL to force a level when testing.
type Level = 'high' | 'medium' | 'low';

interface NetworkInfo { saveData?: boolean; effectiveType?: string }
interface NavigatorHints { deviceMemory?: number; connection?: NetworkInfo }

function chooseLevel(): Level {
  const forced = new URLSearchParams(location.search).get('sky');
  if (forced === 'high' || forced === 'medium' || forced === 'low') return forced;

  const nav = navigator as Navigator & NavigatorHints;
  if (nav.connection?.saveData || /(^|-)2g$/.test(nav.connection?.effectiveType ?? '')) return 'low';
  const memory = nav.deviceMemory ?? 8; // Safari and Firefox don't say; assume a capable device
  const cores = navigator.hardwareConcurrency ?? 4;
  if (memory <= 2 || cores <= 2) return 'low';

  // Is WebGL there at all? (Deliberately no test context: creating one costs as much as drawing
  // the sky. If the real one fails, the renderer simply leaves the CSS sky in place.)
  if (!('WebGLRenderingContext' in window)) return 'low';

  const phoneOrTablet = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
  if (phoneOrTablet || memory < 8 || cores < 6) return 'medium';
  return 'high';
}

const stage = document.querySelector<HTMLElement>('[data-sky-stage]');
if (stage) {
  const label = (theme: string | undefined) => {
    stage.setAttribute('aria-label', theme === 'dark'
      ? 'An animated night sky: the moon rises over a small town and its windows light up one by one.'
      : 'An animated sky: the sun rises behind the DayPrism wordmark over a small town.');
  };
  label(document.documentElement.dataset.theme);
  addEventListener('prism:theme', (e) => label((e as CustomEvent<{ theme: string }>).detail.theme));

  const level = chooseLevel();
  document.documentElement.dataset.sky = level;
  if (level !== 'low') {
    // high: React Three Fiber scene with the 3D town (~250 KB gzipped).
    // medium: the same sky shader in plain WebGL (a few KB), with the painted town.
    const load = () => (level === 'high' ? import('./sky/mount') : import('./sky/lite'));
    const start = () => load().then((m) => m.mount(stage)).catch(() => { /* keep the CSS sky */ });
    const idle = () => ('requestIdleCallback' in window ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 200));
    if (document.readyState === 'complete') idle();
    else addEventListener('load', idle, { once: true });
  }
}
