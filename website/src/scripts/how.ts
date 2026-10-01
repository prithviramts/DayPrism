// "How it works": whichever step is in the middle of the viewport becomes active, and the phone
// shows its screen. Wide screens watch the step texts; phones and tablets watch invisible markers
// inside the pinned area. Works without GSAP and with reduced motion (it just switches).
const how = document.querySelector<HTMLElement>('[data-how]');
if (how) {
  how.classList.add('how-pinned'); // phones: switch from the plain list to the pinned layout
  const all = (sel: string) => [...how.querySelectorAll<HTMLElement>(sel)];
  const activate = (id: string) => {
    for (const el of all('[data-step]')) el.toggleAttribute('data-active', el.dataset.step === id);
    for (const el of all('[data-screen]')) el.toggleAttribute('data-active', el.dataset.screen === id);
    for (const el of all('[data-goto]')) {
      el.toggleAttribute('data-active', el.dataset.goto === id);
      el.setAttribute('aria-current', String(el.dataset.goto === id));
    }
    how.dataset.current = id;
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        activate(el.dataset.step ?? el.dataset.pinStep!);
      }
    },
    { rootMargin: '-45% 0px -45% 0px' },
  );
  for (const el of all('.how-step, [data-pin-step]')) io.observe(el);

  // The dots under the pinned phone jump to their step.
  for (const dot of all('[data-goto]')) {
    dot.addEventListener('click', () => {
      const marker = how.querySelector<HTMLElement>(`[data-pin-step="${dot.dataset.goto}"]`);
      if (!marker) return;
      const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      scrollTo({ top: marker.getBoundingClientRect().top + scrollY - innerHeight / 2 + 40, behavior: smooth ? 'smooth' : 'auto' });
    });
  }
}
