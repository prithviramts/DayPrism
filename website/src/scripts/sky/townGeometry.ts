// Turns the shared town description (src/lib/town.ts) into low-poly three.js geometry:
// one merged mesh for every building and one instanced mesh for every window.
import { BoxGeometry, BufferAttribute, BufferGeometry, ConeGeometry, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Town } from '../../lib/town';

const DEPTH = [60, 50, 40];
const Z = [-150, -78, -12];
const SINK = 40; // buildings extend below ground so the tilt never shows a floating base

function prepare(g: BufferGeometry, layer: number): BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute('uv');
  out.computeVertexNormals(); // non-indexed → flat, faceted low-poly shading
  out.setAttribute('aLayer', new Float32BufferAttribute(new Array(out.attributes.position.count).fill(layer), 1));
  return out;
}

function gable(x0: number, x1: number, y: number, rise: number, z0: number, z1: number): BufferGeometry {
  const xm = (x0 + x1) / 2;
  const L = [x0, y], R = [x1, y], A = [xm, y + rise];
  const tri = (a: number[], b: number[], c: number[], z: number) => [a[0], a[1], z, b[0], b[1], z, c[0], c[1], z];
  const quad = (a: number[], b: number[]) => [
    a[0], a[1], z1, b[0], b[1], z1, b[0], b[1], z0,
    a[0], a[1], z1, b[0], b[1], z0, a[0], a[1], z0,
  ];
  const v = [
    ...tri(L, R, A, z1), // front gable
    ...tri(R, L, A, z0), // back gable
    ...quad(L, A), // left slope
    ...quad(A, R), // right slope
  ];
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3));
  return g;
}

export interface TownMeshData {
  buildings: BufferGeometry;
  windowCount: number;
  matrices: Float32Array;
  order: Float32Array;
  layer: Float32Array;
  seed: Float32Array;
}

export function buildTown(town: Town): TownMeshData {
  const parts: BufferGeometry[] = [];
  for (const b of town.buildings) {
    const d = DEPTH[b.layer];
    const z = Z[b.layer];
    const box = new BoxGeometry(b.w, b.h + SINK, d);
    box.translate(b.x + b.w / 2, (b.h + SINK) / 2 - SINK, z);
    parts.push(prepare(box, b.layer));
    if (b.roof === 'gable') {
      parts.push(prepare(gable(b.x - 4, b.x + b.w + 4, b.h, b.roofH, z - d / 2 - 2, z + d / 2 + 2), b.layer));
    } else if (b.roof === 'spire') {
      const cone = new ConeGeometry(Math.min(10, b.w / 4), b.roofH, 4);
      cone.rotateY(Math.PI / 4);
      cone.translate(b.x + b.w / 2, b.h + b.roofH / 2, z);
      parts.push(prepare(cone, b.layer));
    }
  }
  const buildings = mergeGeometries(parts)!;

  const n = town.windows.length;
  const matrices = new Float32Array(n * 16);
  const order = new Float32Array(n);
  const layer = new Float32Array(n);
  const seed = new Float32Array(n);
  const m = new Matrix4();
  const q = new Quaternion();
  town.windows.forEach((w, i) => {
    const z = Z[w.layer] + DEPTH[w.layer] / 2 + 0.6;
    m.compose(new Vector3(w.x + w.w / 2, w.y + w.h / 2, z), q, new Vector3(w.w, w.h, 1));
    m.toArray(matrices, i * 16);
    order[i] = w.order;
    layer[i] = w.layer;
    const h = Math.sin(i * 12.9898) * 43758.5453;
    seed[i] = h - Math.floor(h);
  });
  return { buildings, windowCount: n, matrices, order, layer, seed };
}
