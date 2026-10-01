// Draws the sky shader with plain WebGL into any canvas: an OffscreenCanvas inside the sky worker,
// or a normal canvas on the main thread where workers can't draw. Used by the "medium" level.
import { generateTown, HEIGHT, WIDTH, type Town } from '../../lib/town';
import { skyFragment } from './shaders';
import { live, state } from './timeline';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Source = TexImageSource;

const vertex = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/** Paints the town for the shader: R = layer, G = window lighting order, B = "this is a window". */
function paintTown(town: Town, c: AnyCanvas) {
  const k = 0.5;
  c.width = WIDTH * k;
  c.height = HEIGHT * k;
  const ctx = c.getContext('2d') as Ctx2D;
  ctx.scale(k, k);
  const flipY = (y: number) => HEIGHT - y;
  for (const layer of [0, 1, 2] as const) {
    ctx.fillStyle = `rgb(${[85, 170, 255][layer]},0,0)`;
    for (const b of town.buildings) {
      if (b.layer !== layer) continue;
      ctx.beginPath();
      if (b.roof === 'gable') {
        ctx.moveTo(b.x - 4, flipY(b.h));
        ctx.lineTo(b.x + b.w / 2, flipY(b.h + b.roofH));
        ctx.lineTo(b.x + b.w + 4, flipY(b.h));
      } else if (b.roof === 'spire') {
        ctx.moveTo(b.x + b.w / 2 - 2, flipY(b.h));
        ctx.lineTo(b.x + b.w / 2, flipY(b.h + b.roofH));
        ctx.lineTo(b.x + b.w / 2 + 2, flipY(b.h));
      }
      ctx.rect(b.x, flipY(b.h), b.w, b.h);
      ctx.fill();
    }
    for (const w of town.windows) {
      if (w.layer !== layer) continue;
      ctx.fillStyle = `rgb(${[85, 170, 255][layer]},${Math.round(Math.min(1, w.order) * 255)},255)`;
      ctx.fillRect(w.x, flipY(w.y + w.h), w.w, w.h);
    }
  }
}

export interface Renderer {
  setMask(source: Source): void;
  resize(width: number, height: number): void;
  draw(): void;
}

/**
 * Sets up WebGL on the canvas. Shaders compile in the background where the browser supports it
 * (KHR_parallel_shader_compile); `ready` is called once it can draw, or `fail` if it can't
 * (for example no high-precision floats on the GPU), in which case the CSS sky simply stays.
 */
export function createRenderer(canvas: AnyCanvas, makeCanvas: () => AnyCanvas, ready: (r: Renderer) => void, fail: () => void) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' }) as WebGLRenderingContext | null;
  if (!gl) { fail(); return; }

  const program = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, `#define RAY_SAMPLES 20\n${skyFragment}`]] as const) {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    gl.attachShader(program, sh);
  }
  gl.linkProgram(program);
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  const whenLinked = () => {
    if (parallel && !gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) { setTimeout(whenLinked, 50); return; }
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { fail(); return; }
    ready(setup(gl, program, canvas, makeCanvas));
  };
  whenLinked();
}

function setup(gl: WebGLRenderingContext, program: WebGLProgram, canvas: AnyCanvas, makeCanvas: () => AnyCanvas): Renderer {
  gl.useProgram(program);
  // One triangle that covers the whole screen.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = (name: string) => gl.getUniformLocation(program, name);
  const loc = {
    res: u('uRes'), time: u('uTime'), dawn: u('uDawn'), night: u('uNight'), rise: u('uRise'), windows: u('uWindows'),
    sun: u('uSun'), moon: u('uMoon'), moonR: u('uMoonR'), sunR: u('uSunR'), rays: u('uRayStrength'), townRect: u('uTownRect'),
  };

  const texture = (unit: number) => {
    const t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // canvases are top-down; uv is bottom-up
  const maskTex = texture(0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  texture(1);
  const townCanvas = makeCanvas();
  paintTown(generateTown(), townCanvas);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, townCanvas as Source);
  gl.uniform1i(u('uMask'), 0);
  gl.uniform1i(u('uTown'), 1);
  gl.uniform1f(u('uUseTown'), 1);

  return {
    setMask(source) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    },
    resize(width, height) {
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    draw() {
      gl.uniform2f(loc.res, canvas.width, canvas.height);
      gl.uniform1f(loc.time, state.time);
      gl.uniform1f(loc.dawn, state.dawn);
      gl.uniform1f(loc.night, state.night);
      gl.uniform1f(loc.rise, state.rise);
      gl.uniform1f(loc.windows, state.windows);
      gl.uniform2f(loc.sun, state.sunX, state.sunY);
      gl.uniform2f(loc.moon, state.moonX, state.moonY);
      gl.uniform1f(loc.moonR, state.moonR);
      gl.uniform1f(loc.sunR, state.sunR);
      gl.uniform1f(loc.rays, state.rayStrength);
      gl.uniform4f(loc.townRect, ...live.townRect);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
