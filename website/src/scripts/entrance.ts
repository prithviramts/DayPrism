// The sunrise entrance runs on CSS alone (see Hero.astro). This only ends it: on its own after
// 2.7 s, or straight away on any scroll, click, tap or key press.
const root = document.documentElement;

if (root.classList.contains('rising')) {
  const events = ['wheel', 'touchstart', 'pointerdown', 'keydown', 'scroll'] as const;
  const finish = () => {
    if (!root.classList.contains('rising')) return;
    root.classList.remove('rising');
    if (window.prismSky) window.prismSky.rising = false;
    window.dispatchEvent(new Event('prism:risen'));
    for (const e of events) removeEventListener(e, finish);
    clearTimeout(timer);
  };
  const timer = setTimeout(finish, 2700);
  for (const e of events) addEventListener(e, finish, { passive: true, once: true });
}
