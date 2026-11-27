// The About portrait as an old, dreamy film print that can be burned away.
//
//  - The print is drawn from the portrait cutout's alpha: a soft, out-of-focus
//    silhouette against a navy → red dusk, with pale butterflies drifting past
//    and live film grain.
//  - Clicking lights the print at that point. A ragged burn front spreads out,
//    with a thin ember line, a charred band and scorching ahead of it, and
//    sparks lifting off. Burned pixels are transparent, so the real <img>
//    underneath shows through.
//
// Plain WebGL1, one triangle and one texture, like print.js.

import { PALETTE } from './print.js';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

const BURN_MS = 2400;
const FADE_MS = 600;
const STILL_TIME = 14; // the frozen moment shown with reduced motion

const VERT = /* glsl */ `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
uniform sampler2D uPhoto;
uniform vec2 uRes;      // drawing buffer, device px
uniform vec2 uSize;     // frame, css px
uniform vec4 uImg;      // where the <img> is drawn (object-fit: cover): x, y, w, h in css px
uniform float uDpr;
uniform float uTime;
uniform float uGrain;   // 0 freezes the grain (reduced motion)
uniform vec3 uBurn;     // xy = origin in css px, z = progress 0..1
uniform vec3 uHover;    // xy = pointer in css px, z = strength
uniform float uFade;    // overall opacity of the print
uniform vec3 uNavy;
uniform vec3 uBlue;
uniform vec3 uCream;
uniform vec3 uRed;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * vnoise(p);
    p = p * 2.03 + 17.1;
    amp *= 0.5;
  }
  return sum;
}
mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

// The cutout's alpha at a point of the frame (css px).
float photoAlpha(vec2 p) {
  vec2 uv = (p - uImg.xy) / uImg.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return texture2D(uPhoto, uv).a;
}

// Out-of-focus silhouette: the alpha sampled over a golden-angle disk.
float silhouette(vec2 p, float r) {
  float sum = photoAlpha(p);
  for (int i = 1; i < 16; i++) {
    float fi = float(i);
    float a = fi * 2.39996;
    sum += photoAlpha(p + vec2(cos(a), sin(a)) * r * sqrt(fi / 15.0));
  }
  return sum / 16.0;
}

// One soft wing: an ellipse in wing-local space, with a wide halo.
float wing(vec2 l, vec2 c, vec2 r, float a, float soft) {
  float d = length(rot(a) * (l - c) / r);
  return 1.0 - smoothstep(1.0 - soft, 1.0 + soft, d) + 0.18 * exp(-d * d * 0.9);
}

// A blurred butterfly at c (units of frame height); flap squashes the wings.
float butterfly(vec2 q, vec2 c, float size, float ang, float flap, float soft) {
  vec2 l = rot(ang) * (q - c) / size;
  l.x = abs(l.x) / flap;
  float m = wing(l, vec2(0.62, -0.32), vec2(0.62, 0.46), -0.45, soft);
  m = max(m, wing(l, vec2(0.42, 0.38), vec2(0.4, 0.3), 0.5, soft));
  return clamp(m, 0.0, 1.2);
}

vec3 flutter(vec3 col, vec2 q, float t, float first, float last) {
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    if (fi < first || fi > last) continue;
    float h = hash(vec2(fi, 3.7));
    float aspect = uSize.x / uSize.y;
    vec2 c = vec2(
      aspect * (0.5 + 0.42 * sin(t * (0.05 + 0.04 * h) + fi * 1.7)),
      0.48 + 0.36 * sin(t * (0.037 + 0.03 * h) + fi * 2.3) + 0.02 * sin(t * 1.3 + fi));
    float size = mix(0.045, 0.1, fract(h * 7.3)) * (fi > 2.5 ? 1.25 : 1.0);
    float ang = 0.35 * sin(t * 0.4 + fi * 2.0) + (h - 0.5);
    float flap = 0.3 + 0.7 * abs(sin(t * (4.0 + 3.0 * h) + fi * 1.3));
    float soft = fi > 2.5 ? 0.85 : 0.55; // the near ones are further out of focus
    float m = butterfly(q, c, size, ang, flap, soft);
    vec3 tint = mix(uBlue * 1.25, uCream, 0.45 + 0.4 * h);
    col = mix(col, tint, clamp(m, 0.0, 1.0) * 0.85);
  }
  return col;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr; // css px, top-left origin
  vec2 uv = p / uSize;
  vec2 q = p / uSize.y;
  float t = uTime;

  // Dusk: navy above, a smouldering red band low down, dark ground beneath.
  vec3 col = mix(uNavy * 0.7, mix(uNavy, uBlue, 0.5), smoothstep(0.0, 0.5, uv.y));
  float haze = fbm(vec2(q.x * 2.2 + t * 0.02, uv.y * 3.0));
  float band = smoothstep(0.48, 0.66, uv.y) * (1.0 - smoothstep(0.8, 0.97, uv.y));
  col = mix(col, uRed * 1.15 + vec3(0.1, 0.03, 0.0), band * (0.55 + 0.6 * haze));
  col = mix(col, uNavy * 0.45, smoothstep(0.86, 1.0, uv.y));
  col += (fbm(q * 2.6 + vec2(t * 0.012, 3.1)) - 0.5) * 0.14;
  col += uBlue * 0.32 * exp(-dot(q - vec2(0.22, 0.16), q - vec2(0.22, 0.16)) * 14.0);

  col = flutter(col, q, t, 0.0, 2.0); // behind the figure

  float sil = silhouette(p + vec2(0.0, 1.5 * sin(t * 0.5)), 0.03 * uSize.y);
  col = mix(col, mix(uNavy * 0.22, uNavy * 0.4, uv.y), smoothstep(0.08, 0.7, sil) * 0.94);

  col = flutter(col, q, t, 3.0, 4.0); // in front of it

  // Film: lifted blacks, vignette, grain.
  col = col * 0.9 + 0.045;
  col *= 1.0 - 0.45 * smoothstep(0.35, 0.95, length(uv - 0.5) * 1.25);
  col += (hash(gl_FragCoord.xy + floor(t * 24.0) * uGrain * 17.0) - 0.5) * 0.12;

  // A lighter held near the paper: it warms under the pointer.
  vec2 dh = (p - uHover.xy) / uSize.y;
  col += vec3(1.0, 0.55, 0.2) * 0.22 * uHover.z * exp(-dot(dh, dh) * 40.0);

  float alpha = 1.0;
  if (uBurn.z > 0.0) {
    // Distance from the light, stretched by noise so the front is ragged.
    float d = length(p - uBurn.xy) / length(uSize);
    float f = d * (0.7 + 0.6 * fbm(q * 5.0 + 4.0)) + 0.012 * (vnoise(q * 45.0) - 0.5);
    float e = f - uBurn.z * 1.35;

    float scorch = 1.0 - smoothstep(0.0, 0.13, e);
    col *= mix(vec3(1.0), vec3(0.78, 0.55, 0.32), scorch * 0.7);
    float charred = 1.0 - smoothstep(0.0, 0.04, e);
    col = mix(col, vec3(0.07, 0.045, 0.035), charred);
    float flicker = 0.8 + 0.4 * vnoise(q * 30.0 + t * 6.0);
    float ember = 1.0 - smoothstep(0.0, 0.012, e);
    col += mix(vec3(1.0, 0.86, 0.5), uRed * 1.4, smoothstep(0.0, 0.012, e)) * ember * flicker * 1.6;
    alpha = smoothstep(-0.003, 0.0, e);

    // Sparks lifting off the front.
    vec2 g = q * 28.0 + vec2(0.0, t * 2.2);
    vec2 id = floor(g);
    float r = hash(id + 11.0);
    float spark = step(0.88, r) * (1.0 - smoothstep(0.05, 0.16, length(fract(g) - 0.5)))
      * (1.0 - smoothstep(0.0, 0.06, abs(e - 0.015)));
    col += vec3(1.0, 0.7, 0.3) * spark * 1.5;
    alpha = max(alpha, spark);
  }

  alpha *= uFade;
  gl_FragColor = vec4(col * alpha, alpha); // premultiplied
}
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[portrait] shader failed to compile:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

const ease = (k) => k * k * (3 - 2 * k);

/**
 * Lays a burnable print over `img` inside `frame`.
 * Returns null when WebGL is unavailable; the plain photo then just stays.
 */
export function createBurnPortrait(frame, { img, reduceMotion = false, onBurned, onReprint } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'about__burn';
  canvas.setAttribute('aria-hidden', 'true');

  const attrs = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false };
  let gl = null;
  try {
    gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
  } catch {
    gl = null;
  }
  if (!gl) return null;

  let program = null;
  let texture = null;
  let buffer = null;
  let u = {};
  let ready = false; // texture uploaded

  function init() {
    const high = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    const precision = high && high.precision > 0 ? 'highp' : 'mediump';
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, `precision ${precision} float;\n${FRAG}`);
    if (!vs || !fs) return false;
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('[portrait] shader failed to link:', gl.getProgramInfoLog(program));
      return false;
    }
    gl.useProgram(program);

    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    u = {};
    for (const name of [
      'uPhoto', 'uRes', 'uSize', 'uImg', 'uDpr', 'uTime', 'uGrain', 'uBurn', 'uHover', 'uFade',
      'uNavy', 'uBlue', 'uCream', 'uRed',
    ]) {
      u[name] = gl.getUniformLocation(program, name);
    }
    gl.uniform1i(u.uPhoto, 0);
    gl.uniform3fv(u.uNavy, rgb(PALETTE.navy));
    gl.uniform3fv(u.uBlue, rgb(PALETTE.blue));
    gl.uniform3fv(u.uCream, rgb(PALETTE.cream));
    gl.uniform3fv(u.uRed, rgb(PALETTE.red));
    gl.clearColor(0, 0, 0, 0);
    return true;
  }

  if (!init()) return null;

  // ---------- state ----------
  let w = 1;
  let h = 1;
  let dpr = 1;
  let state = 'print'; // print → burning → burned → (reprint) fading-in → print
  let burn = { x: 0, y: 0, start: 0 };
  let fade = { from: 1, to: 1, start: 0 };
  const hover = { x: 0, y: 0, amt: 0, target: 0 };
  let visible = false;
  let raf = 0;
  const t0 = performance.now();

  function uploadPhoto() {
    if (!img.naturalWidth) return;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    ready = true;
    frame.classList.add('has-burn');
    kick();
  }

  // Mirror `object-fit: cover; object-position: 50% 0` so the silhouette sits
  // exactly on the photo it hides.
  function imgRect() {
    const iw = img.naturalWidth || 1;
    const ih = img.naturalHeight || 1;
    const s = Math.max(w / iw, h / ih);
    return [(w - iw * s) * 0.5, 0, iw * s, ih * s];
  }

  function resize() {
    const r = frame.getBoundingClientRect();
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    kick();
  }

  function draw(now) {
    if (gl.isContextLost() || !ready) return;
    const time = reduceMotion ? STILL_TIME : (now - t0) / 1000;

    let progress = 0;
    if (state === 'burning') {
      const k = Math.min(1, (now - burn.start) / BURN_MS);
      progress = ease(k);
      if (k >= 1) finishBurn();
    } else if (state === 'burned') {
      progress = 1;
    }

    let opacity = 1;
    if (fade.from !== fade.to) {
      const k = Math.min(1, (now - fade.start) / (reduceMotion ? 400 : FADE_MS));
      opacity = fade.from + (fade.to - fade.from) * ease(k);
      if (k >= 1) {
        fade.from = fade.to;
        if (state === 'fading-out') finishBurn();
        else if (state === 'fading-in') state = 'print';
      }
    } else {
      opacity = fade.to;
    }

    hover.amt += (hover.target - hover.amt) * 0.12;

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniform2f(u.uSize, w, h);
    gl.uniform4fv(u.uImg, imgRect());
    gl.uniform1f(u.uDpr, dpr);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uGrain, reduceMotion ? 0 : 1);
    gl.uniform3f(u.uBurn, burn.x, burn.y, progress);
    gl.uniform3f(u.uHover, hover.x, hover.y, state === 'print' ? hover.amt : 0);
    gl.uniform1f(u.uFade, opacity);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Keep animating only while something on screen is changing.
  const animating = () =>
    state === 'burning' ||
    state === 'fading-in' ||
    state === 'fading-out' ||
    Math.abs(hover.target - hover.amt) > 0.01 ||
    (!reduceMotion && state === 'print');

  function loop(now) {
    raf = 0;
    draw(now);
    if (visible && animating()) raf = requestAnimationFrame(loop);
  }
  function kick() {
    if (!raf && visible) raf = requestAnimationFrame(loop);
  }

  function finishBurn() {
    if (state === 'burned') return;
    state = 'burned';
    fade = { from: 1, to: 1, start: 0 };
    frame.classList.add('is-burned');
    frame.setAttribute('aria-pressed', 'true');
    onBurned?.();
  }

  // ---------- public actions ----------
  function light(x, y) {
    if (state !== 'print' || !ready) return;
    if (reduceMotion) {
      state = 'fading-out';
      fade = { from: 1, to: 0, start: performance.now() };
    } else {
      state = 'burning';
      burn = { x, y, start: performance.now() };
    }
    kick();
  }

  function reprint() {
    if (state !== 'burned') return;
    state = 'fading-in';
    burn.start = 0;
    fade = { from: 0, to: 1, start: performance.now() };
    frame.classList.remove('is-burned');
    frame.setAttribute('aria-pressed', 'false');
    onReprint?.();
    kick();
  }

  // ---------- input ----------
  const local = (e) => {
    const r = frame.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const onClick = (e) => {
    const [x, y] = e.detail === 0 ? [w / 2, h / 2] : local(e); // detail 0: keyboard
    light(x, y);
  };
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      light(w / 2, h / 2);
    }
  };
  const onMove = (e) => {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    [hover.x, hover.y] = local(e);
    hover.target = 1;
    kick();
  };
  const onLeave = () => {
    hover.target = 0;
    kick();
  };

  frame.append(canvas);
  frame.setAttribute('role', 'button');
  frame.setAttribute('tabindex', '0');
  frame.setAttribute('aria-pressed', 'false');
  frame.setAttribute('aria-label', 'Burn the print to reveal the photo');
  frame.addEventListener('click', onClick);
  frame.addEventListener('keydown', onKey);
  frame.addEventListener('pointermove', onMove);
  frame.addEventListener('pointerleave', onLeave);

  const ro = new ResizeObserver(resize);
  ro.observe(frame);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    kick();
  });
  io.observe(frame);

  const onLost = (e) => {
    e.preventDefault();
    // Without a print to burn, just show the photo.
    cancelAnimationFrame(raf);
    frame.classList.remove('has-burn', 'is-burned');
    canvas.remove();
  };
  canvas.addEventListener('webglcontextlost', onLost);

  if (img.complete && img.naturalWidth) uploadPhoto();
  else img.addEventListener('load', uploadPhoto, { once: true });

  return {
    burn: light,
    reprint,
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      frame.removeEventListener('click', onClick);
      frame.removeEventListener('keydown', onKey);
      frame.removeEventListener('pointermove', onMove);
      frame.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('webglcontextlost', onLost);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      canvas.remove();
    },
  };
}
