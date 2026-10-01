// GLSL for the hero sky. One full-screen pass draws the sky gradient, sun, god rays, stars,
// moon and (at the medium level) the painted town. Colours match the CSS fallback in Hero.astro.

export const skyVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0); // a full-screen quad that ignores the camera
}
`;

export const skyFragment = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform vec2 uRes;          // canvas size in pixels
uniform float uTime;
uniform float uDawn;        // 0 pre-dawn → 1 morning (the entrance)
uniform float uNight;       // 0 day → 1 night (theme)
uniform float uRise;        // moonrise progress for the dark-theme entrance
uniform float uWindows;     // windows with a lighting order below this are lit
uniform vec2 uSun;          // sun centre, uv
uniform vec2 uMoon;         // moon centre, uv
uniform float uMoonR;       // moon radius as a fraction of the canvas height
uniform float uSunR;        // sun radius as a fraction of the canvas height
uniform sampler2D uMask;    // the wordmark, white on black: it blocks the light → rays
uniform float uRayStrength;
uniform sampler2D uTown;    // medium level: R = layer, G = window order, B = window present
uniform float uUseTown;
uniform vec4 uTownRect;     // x, y (bottom-left, uv) and w, h (uv) of the painted town

vec3 grad4(float t, vec3 a, vec3 b, vec3 c, vec3 d, float s1, float s2) {
  // a at the horizon (t=0) → b at s1 → c at s2 → d at the top (t=1)
  if (t < s1) return mix(a, b, smoothstep(0.0, s1, t));
  if (t < s2) return mix(b, c, smoothstep(s1, s2, t));
  return mix(c, d, smoothstep(s2, 1.0, t));
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(float x) { float i = floor(x); float f = fract(x); return mix(hash(vec2(i, 0.0)), hash(vec2(i + 1.0, 0.0)), smoothstep(0.0, 1.0, f)); }

vec3 skyColor(float y) {
  vec3 pre  = grad4(y, vec3(0.169, 0.153, 0.322), vec3(0.102, 0.122, 0.227), vec3(0.063, 0.082, 0.184), vec3(0.043, 0.063, 0.125), 0.25, 0.6);
  vec3 warm = grad4(y, vec3(1.0, 0.773, 0.541), vec3(1.0, 0.541, 0.29), vec3(0.761, 0.255, 0.416), vec3(0.141, 0.125, 0.353), 0.16, 0.45);
  warm = mix(warm, vec3(0.357, 0.227, 0.612), smoothstep(0.45, 0.75, y) * 0.6);
  vec3 day  = grad4(y, vec3(0.984, 0.886, 0.804), vec3(0.937, 0.914, 0.925), vec3(0.843, 0.898, 0.969), vec3(0.737, 0.827, 0.945), 0.26, 0.58);
  vec3 night = grad4(y, vec3(0.106, 0.133, 0.251), vec3(0.075, 0.102, 0.2), vec3(0.043, 0.063, 0.125), vec3(0.024, 0.039, 0.086), 0.2, 0.55);
  float d = uDawn;
  vec3 dawnSky = d < 0.45 ? mix(pre, warm, smoothstep(0.06, 0.45, d)) : mix(warm, day, smoothstep(0.45, 1.0, d));
  return mix(dawnSky, night, uNight);
}

// The light source the rays are made of: the sun disc and its halo, blocked by the wordmark.
float light(vec2 uv, float aspect) {
  vec2 d = (uv - uSun) * vec2(aspect, 1.0);
  float r = length(d);
  float disc = smoothstep(uSunR, uSunR * 0.7, r);
  float halo = exp(-r * 9.0) * 0.55;
  return (disc + halo) * (1.0 - texture2D(uMask, uv).r);
}

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;
  vec3 col = skyColor(uv.y);
  float day = 1.0 - uNight;

  // Sun glow, warmer while low on the horizon.
  vec2 ds = (uv - uSun) * vec2(aspect, 1.0);
  float r = length(ds);
  vec3 sunWarm = mix(vec3(1.0, 0.62, 0.32), vec3(1.0, 0.9, 0.74), smoothstep(0.3, 1.0, uDawn));
  // Strong glow at dawn, calmer once it's full morning so the text stays easy to read.
  float glowK = mix(0.42, 0.2, smoothstep(0.6, 1.0, uDawn));
  col += sunWarm * exp(-r * 4.0) * glowK * day;
  col = mix(col, vec3(1.0, 0.97, 0.9), smoothstep(uSunR, uSunR * 0.75, r) * day);

  // God rays: march from this pixel towards the sun, collecting light the wordmark doesn't block
  // (GPU Gems 3, "Volumetric Light Scattering as a Post-Process").
  if (day > 0.01 && uRayStrength > 0.0) {
    vec2 delta = (uv - uSun) / float(RAY_SAMPLES) * 0.92;
    vec2 p = uv - delta * hash(uv * uRes + uTime); // jitter hides banding
    float decay = 1.0, illum = 0.0;
    for (int i = 0; i < RAY_SAMPLES; i++) {
      p -= delta;
      illum += light(p, aspect) * decay;
      decay *= 0.965;
    }
    illum /= float(RAY_SAMPLES);
    // Slow drift so the fan never repeats visibly.
    float ang = atan(ds.y, ds.x);
    float drift = 0.72 + 0.28 * noise(ang * 9.0 + uTime * 0.05) * noise(ang * 23.0 - uTime * 0.035 + 4.0);
    col += sunWarm * illum * drift * uRayStrength * day;
  }

  // Stars, fading towards the horizon, each twinkling at its own pace.
  if (uNight > 0.01) {
    vec2 g = uv * vec2(aspect, 1.0) * 70.0;
    vec2 cell = floor(g);
    float h = hash(cell);
    if (h > 0.965) {
      vec2 c = fract(g) - vec2(hash(cell + 1.3), hash(cell + 7.1)) * 0.6 - 0.2;
      float tw = 0.55 + 0.45 * sin(uTime * (0.6 + h * 1.4) + h * 40.0);
      float s = smoothstep(0.09, 0.0, length(c)) * tw * smoothstep(0.32, 0.85, uv.y);
      col += vec3(0.9, 0.93, 1.0) * s * uNight * smoothstep(0.0, 0.6, uRise);
    }
  }

  // The moon, with a soft cool bloom.
  if (uNight > 0.01) {
    vec2 dm = (uv - uMoon) * vec2(aspect, 1.0);
    float rm = length(dm);
    float mr = uMoonR;
    float disc = smoothstep(mr, mr * 0.92, rm);
    float shade = 0.86 + 0.14 * smoothstep(mr, -mr, dm.x + dm.y);
    col += vec3(0.56, 0.62, 0.95) * exp(-rm * 0.35 / mr) * 0.32 * uNight;
    col += vec3(0.75, 0.8, 1.0) * exp(-rm * 1.1 / mr) * 0.25 * uNight;
    col = mix(col, vec3(0.875, 0.906, 1.0) * shade, disc * uNight);
  }

  // Medium level: the town painted from a texture, its windows lit by the shader.
  if (uUseTown > 0.5) {
    vec2 tuv = (uv - uTownRect.xy) / uTownRect.zw;
    if (tuv.x >= 0.0 && tuv.x <= 1.0 && tuv.y >= 0.0 && tuv.y <= 1.0) {
      vec4 t = texture2D(uTown, tuv);
      float cover = step(0.15, t.r);
      if (cover > 0.0) {
        float layer = t.r; // ~0.33 back, ~0.66 middle, 1.0 front
        float dayness = day * smoothstep(0.1, 0.9, uDawn);
        vec3 dayC = layer < 0.5 ? vec3(0.765, 0.804, 0.894) : layer < 0.85 ? vec3(0.663, 0.714, 0.827) : vec3(0.557, 0.612, 0.753);
        vec3 nightC = layer < 0.5 ? vec3(0.102, 0.133, 0.259) : layer < 0.85 ? vec3(0.075, 0.102, 0.208) : vec3(0.051, 0.075, 0.161);
        vec3 c = mix(nightC, dayC, dayness);
        if (t.b > 0.5) {
          float lit = smoothstep(t.g - 0.01, t.g + 0.01, uWindows) * step(t.g, 0.995);
          float flicker = 0.85 + 0.15 * hash(floor(tuv * vec2(800.0, 210.0)));
          c = mix(c * 0.92, vec3(1.0, 0.824, 0.478) * flicker, lit);
        }
        col = mix(col, c, cover);
      }
    }
  }

  gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
}
`;

export const townVertex = /* glsl */ `
attribute float aLayer;
varying vec3 vNormal;
varying float vLayer;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vLayer = aLayer;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const townFragment = /* glsl */ `
precision highp float;
varying vec3 vNormal;
varying float vLayer;
uniform float uDayness;
uniform float uNight;
uniform vec3 uMoonDir;
uniform vec3 uSunDir;
void main() {
  vec3 dayC = vLayer < 0.5 ? vec3(0.765, 0.804, 0.894) : vLayer < 1.5 ? vec3(0.663, 0.714, 0.827) : vec3(0.557, 0.612, 0.753);
  vec3 nightC = vLayer < 0.5 ? vec3(0.102, 0.133, 0.259) : vLayer < 1.5 ? vec3(0.075, 0.102, 0.208) : vec3(0.051, 0.075, 0.161);
  vec3 n = normalize(vNormal);
  vec3 c = mix(nightC, dayC, uDayness);
  // Warm sunlight on the faces turned towards the sun.
  c += vec3(1.0, 0.75, 0.5) * max(dot(n, uSunDir), 0.0) * 0.14 * uDayness;
  // Cool moonlight catching rooftops and the sides facing the moon (rim light).
  float rim = max(dot(n, uMoonDir), 0.0);
  c += vec3(0.72, 0.78, 1.0) * rim * (0.16 + 0.22 * step(0.6, n.y)) * uNight;
  gl_FragColor = vec4(c, 1.0);
}
`;

export const windowVertex = /* glsl */ `
attribute float aOrder;
attribute float aLayer;
attribute float aSeed;
varying float vOrder;
varying float vSeed;
varying float vLayer;
void main() {
  vOrder = aOrder;
  vLayer = aLayer;
  vSeed = aSeed;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

export const windowFragment = /* glsl */ `
precision highp float;
varying float vOrder;
varying float vSeed;
varying float vLayer;
uniform float uWindows;
uniform float uDayness;
void main() {
  vec3 glassDay = vLayer < 0.5 ? vec3(0.69, 0.74, 0.85) : vLayer < 1.5 ? vec3(0.58, 0.64, 0.77) : vec3(0.47, 0.53, 0.69);
  vec3 glass = mix(vec3(0.04, 0.06, 0.13), glassDay, uDayness);
  float lit = smoothstep(vOrder - 0.012, vOrder + 0.012, uWindows) * step(vOrder, 0.995);
  vec3 warm = mix(vec3(1.0, 0.76, 0.42), vec3(1.0, 0.86, 0.56), vSeed) * (0.85 + 0.15 * vSeed);
  gl_FragColor = vec4(mix(glass, warm, lit), 1.0);
}
`;
