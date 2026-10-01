// Theme switching. The pre-paint boot script in the <head> already applied the right theme, so
// this only wires up the dial, remembers a manual choice and tells the 3D scene.
type Theme = 'light' | 'dark';
const KEY = 'dayprism-theme';
const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

export const getTheme = (): Theme => (root.dataset.theme === 'dark' ? 'dark' : 'light');

function reflect() {
  const dark = getTheme() === 'dark';
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) {
    b.setAttribute('aria-checked', String(dark));
  }
}

export function setTheme(next: Theme, remember: boolean) {
  if (next === getTheme()) return;
  const apply = () => {
    root.classList.remove('rising'); // a theme change ends the entrance
    if (window.prismSky) window.prismSky.rising = false;
    root.dataset.theme = next;
    reflect();
  };
  // Cross-fade the page colours (View Transitions API) unless the visitor prefers less motion.
  if (!reduceMotion.matches && 'startViewTransition' in document) document.startViewTransition(apply);
  else apply();
  if (remember) {
    try { localStorage.setItem(KEY, next); } catch { /* private mode: fine, just not remembered */ }
  }
  window.dispatchEvent(new CustomEvent('prism:theme', { detail: { theme: next } }));
}

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) {
  b.addEventListener('click', () => setTheme(getTheme() === 'dark' ? 'light' : 'dark', true));
}

// Follow the system setting live, unless the visitor picked a theme themselves.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  let stored: string | null = null;
  try { stored = localStorage.getItem(KEY); } catch { /* ignore */ }
  if (!stored) setTheme(e.matches ? 'dark' : 'light', false);
});

reflect();
