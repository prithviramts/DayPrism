// The "high" hero for desktops and strong devices: a React Three Fiber scene with the same sky
// shader as the lightweight renderer (lite.ts), plus the low-poly 3D town with moonlit rooftops
// and instanced windows. Loaded lazily, only where it can run smoothly.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Component, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  CanvasTexture, InstancedBufferAttribute, InstancedMesh, LinearFilter, PlaneGeometry, ShaderMaterial, Vector2, Vector3,
  type Group,
} from 'three';
import { generateTown, WIDTH, type Town } from '../../lib/town';
import { currentTheme, listen, markDead, markLive, reduceMotion } from './dom';
import { live, setTheme, state, tick } from './timeline';
import { skyFragment, skyVertex, townFragment, townVertex, windowFragment, windowVertex } from './shaders';
import { buildTown } from './townGeometry';

const maskTexture = new CanvasTexture(document.createElement('canvas'));
maskTexture.minFilter = LinearFilter;
maskTexture.generateMipmaps = false;

/** The one set of uniforms every material shares, copied from core.state each frame. */
const uniforms = {
  uRes: { value: new Vector2(1, 1) },
  uTime: { value: 0 },
  uDawn: { value: 1 },
  uNight: { value: 0 },
  uRise: { value: 1 },
  uWindows: { value: 0 },
  uSun: { value: new Vector2(0.5, 0.6) },
  uMoon: { value: new Vector2(0.8, 0.8) },
  uMoonR: { value: 0.05 },
  uSunR: { value: 0.07 },
  uMask: { value: maskTexture },
  uRayStrength: { value: 0.4 },
  uTown: { value: null },
  uUseTown: { value: 0 }, // the 3D town is drawn as geometry instead
  uTownRect: { value: [0, 0, 1, 0.3] },
  uDayness: { value: 1 },
  uMoonDir: { value: new Vector3(0.5, 0.75, -0.45).normalize() },
  uSunDir: { value: new Vector3(0.15, 0.85, -0.35).normalize() },
};

function SkyPlane() {
  const material = useMemo(() => new ShaderMaterial({
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    uniforms,
    defines: { RAY_SAMPLES: 44 },
    depthTest: false,
    depthWrite: false,
  }), []);
  return (
    <mesh frustumCulled={false} renderOrder={-1} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

function Town3D({ town }: { town: Town }) {
  const group = useRef<Group>(null);
  const { size } = useThree();
  const data = useMemo(() => buildTown(town), [town]);
  const buildingMat = useMemo(() => new ShaderMaterial({ vertexShader: townVertex, fragmentShader: townFragment, uniforms }), []);
  const windows = useMemo(() => {
    const mesh = new InstancedMesh(new PlaneGeometry(1, 1), new ShaderMaterial({ vertexShader: windowVertex, fragmentShader: windowFragment, uniforms }), data.windowCount);
    mesh.instanceMatrix.array.set(data.matrices);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.geometry.setAttribute('aOrder', new InstancedBufferAttribute(data.order, 1));
    mesh.geometry.setAttribute('aLayer', new InstancedBufferAttribute(data.layer, 1));
    mesh.geometry.setAttribute('aSeed', new InstancedBufferAttribute(data.seed, 1));
    mesh.frustumCulled = false;
    return mesh;
  }, [data]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.scale.setScalar(live.townScale);
    g.position.set(0, -size.height / 2 + live.townRect[1] * size.height - 4, 0);
    // A slight downward look shows the moonlit rooftops; the pointer turns the town a touch.
    g.rotation.set(0.09 + live.pointer.y * 0.025, live.pointer.x * 0.05, 0);
  });

  return (
    <group ref={group}>
      {/* Centre the town on the group's origin, so turning it pivots around the middle. */}
      <group position={[-WIDTH / 2, 0, 0]}>
        <mesh geometry={data.buildings} material={buildingMat} frustumCulled={false} />
        <primitive object={windows} />
      </group>
    </group>
  );
}

function Driver({ stage }: { stage: HTMLElement }) {
  const { gl, size, invalidate, setFrameloop } = useThree();
  const first = useRef(true);

  useEffect(() => {
    live.reduceMotion = reduceMotion;
    live.theme = currentTheme();
    live.rising = !!window.prismSky?.rising;
    live.riseStart = window.prismSky?.start ?? 0;
    listen(stage, {
      layout: (l, mask) => {
        Object.assign(live, { width: l.width, height: l.height, sunTarget: l.sunTarget, moonTarget: l.moonTarget, moonR: l.moonR, townRect: l.townRect, townScale: l.townScale });
        maskTexture.image = mask;
        maskTexture.needsUpdate = true;
        invalidate();
      },
      theme: (theme) => { setTheme(theme, performance.now()); invalidate(); },
      risen: () => { live.rising = false; invalidate(); },
      scroll: (value) => { live.scroll = value; invalidate(); },
      pointer: (x, y) => { live.pointerTarget = { x, y }; },
      running: (on) => setFrameloop(on ? (reduceMotion ? 'demand' : 'always') : 'never'),
    });
  }, [stage, invalidate, setFrameloop]);

  useFrame((_, delta) => {
    const animating = tick(performance.now(), delta);
    uniforms.uRes.value.set(size.width * gl.getPixelRatio(), size.height * gl.getPixelRatio());
    uniforms.uTime.value = state.time;
    uniforms.uDawn.value = state.dawn;
    uniforms.uNight.value = state.night;
    uniforms.uRise.value = state.rise;
    uniforms.uWindows.value = state.windows;
    uniforms.uSun.value.set(state.sunX, state.sunY);
    uniforms.uMoon.value.set(state.moonX, state.moonY);
    uniforms.uMoonR.value = state.moonR;
    uniforms.uSunR.value = state.sunR;
    uniforms.uRayStrength.value = state.rayStrength;
    uniforms.uDayness.value = state.dayness;
    if (reduceMotion && animating) invalidate();
    if (first.current) { first.current = false; markLive(); }
  });
  return null;
}

/** If WebGL fails in any way, quietly fall back to the CSS sky that's already on screen. */
class Fallback extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { markDead(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function SkyScene({ stage }: { stage: HTMLElement }) {
  const town = useMemo(() => generateTown(), []);
  return (
    <Fallback>
      <Canvas
        orthographic
        camera={{ position: [0, 0, 1000], zoom: 1, near: 0.1, far: 5000 }}
        dpr={Math.min(devicePixelRatio, 1.5)}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
        flat
        linear
        onCreated={({ gl }) => gl.domElement.addEventListener('webglcontextlost', markDead)}
      >
        <SkyPlane />
        <Town3D town={town} />
        <Driver stage={stage} />
      </Canvas>
    </Fallback>
  );
}
