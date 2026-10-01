// Mounts the desktop ("high") WebGL scene. Imported lazily by sky-loader.ts, so React and
// three.js are downloaded only on capable devices, after the page is readable.
import { createRoot } from 'react-dom/client';
import SkyScene from './SkyScene';

export function mount(stage: HTMLElement) {
  createRoot(stage).render(<SkyScene stage={stage} />);
}
