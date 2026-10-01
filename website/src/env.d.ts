/// <reference types="astro/client" />

interface Window {
  /** Set by the boot script in Base.astro before the first paint. */
  prismSky?: { start: number; rising: boolean };
}
