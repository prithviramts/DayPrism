// Loads the scroll motion the first time the visitor scrolls (nothing moves before that), and
// never when they prefer reduced motion. Keeps the first seconds of the page free for loading.
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const events = ['scroll', 'wheel', 'touchmove', 'keydown'] as const;
  const go = () => {
    for (const e of events) removeEventListener(e, go);
    import('./motion');
  };
  for (const e of events) addEventListener(e, go, { passive: true, once: true });
  // Arrived via a link to a section further down (e.g. /#pricing): load straight away.
  if (location.hash || scrollY > 0) go();
}
