// The "press": a single full-screen WebGL shader that turns the soft ink
// canvas (see flowers.js) into a halftone print.
//
//  - Above the edge it prints navy stock with a blue and a cream plate on one
//    45° screen (blue dots that grow, then cream dots growing inside them).
//  - Below the edge it is cream paper, with the flowers left as a faint blue
//    ghost print so text stays readable on top. Flowers that have only just
//    opened print in strong blue there first, then fade to that ghost.
//  - The edge itself dissolves through shrinking dots, and a "spotlight"
//    rectangle can pull any part of the paper back into full print.
//  - A red plate on its own screen angle, nudged out of register.
//  - A lens that swells the dots under the pointer, and static paper grain.
//
// Plain WebGL1, no library: it is one triangle and one texture.

/** Mirrors the theme tokens in :root of style.css. Keep the two in sync. */
export const PALETTE = {
  navy: '#102e46',
  blue: '#719ab8',
  cream: '#faf0d7',
  red: '#b12a29',
};

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

const VERT = /* glsl */ `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
uniform sampler2D uInk;
uniform vec2 uRes;      // drawing buffer, device px
uniform vec2 uInkView;  // area the ink texture covers, css px
uniform vec2 uInkTexel; // one ink texel, in uv
uniform float uDpr;
uniform float uPitch;   // halftone cell, css px
uniform float uEdge;    // viewport y where the print ends and paper begins
uniform float uBand;    // height of the dissolve above that edge
uniform vec3 uPointer;  // xy in css px, z = lens strength
uniform vec4 uSpot;     // spotlight rect: left, top, right, bottom
uniform float uSpotAmt;
uniform float uSeed;
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
  for (int i = 0; i < 3; i++) {
    sum += amp * vnoise(p);
    p = p * 2.03 + 17.1;
    amp *= 0.5;
  }
  return sum;
}

// One halftone screen: which cell this pixel falls in, where that cell's
// centre is on the page, and how far we are from it (in cells).
void screen(vec2 p, float angle, float pitch, out vec2 id, out vec2 centre, out float dist) {
  float c = cos(angle);
  float s = sin(angle);
  mat2 m = mat2(c, -s, s, c);
  vec2 g = m * p / pitch;
  id = floor(g);
  dist = length(g - id - 0.5);
  centre = ((id + 0.5) * pitch) * m; // v * m == transpose(m) * v == the inverse rotation
}

// Dot radius for an ink amount x: area grows linearly at first, and the dots
// have fully merged by x = 1.
float radius(float x) {
  x = clamp(x, 0.0, 1.0);
  return 0.56 * sqrt(x) + 0.24 * x * x * x;
}
float dotMask(float dist, float r, float aa) {
  return r < 0.02 ? 0.0 : 1.0 - smoothstep(r - aa, r + aa, dist);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr; // css px, top-left origin
  vec2 view = uRes / uDpr;

  // Lens: magnify the page (image and screen together) around the pointer.
  vec2 dv = p - uPointer.xy;
  float lens = uPointer.z * exp(-dot(dv, dv) / 22500.0);
  float squeeze = 1.0 - 0.26 * lens;
  vec2 q = uPointer.xy + dv * squeeze;
  float aa = 0.75 * squeeze / (uPitch * uDpr);

  vec2 id;
  vec2 c;
  float d;
  screen(q, 0.7854, uPitch, id, c, d);
  float jit = 0.9 + 0.2 * hash(id + 7.0); // no two dots take ink quite the same

  // Tone is read once per cell, at its centre, so dots stay round. A few
  // extra taps soften it: hard edges would print as stair-steps, soft ones
  // as dots that shrink away.
  vec2 uv = c / uInkView;
  vec2 o = uInkTexel * 1.6;
  vec4 centre = texture2D(uInk, uv);
  float ink = (centre.r * 2.0 + texture2D(uInk, uv + o).r + texture2D(uInk, uv - o).r +
               texture2D(uInk, uv + vec2(o.x, -o.y)).r + texture2D(uInk, uv + vec2(-o.x, o.y)).r) / 6.0;
  float fresh = centre.b;

  // Spotlight: a rectangle of paper that gets printed back in (see below).
  float spot = uSpotAmt > 0.001
    ? step(uSpot.x, p.x) * step(p.x, uSpot.z) * step(uSpot.y, p.y) * step(p.y, uSpot.w)
    : 0.0;

  float vig = 1.0 - smoothstep(0.3, 0.85, length(c / view - 0.5));
  float cloud = fbm(c * 0.0022 + uSeed);
  float ground = (0.025 + 0.2 * smoothstep(0.32, 0.78, cloud)) * (0.4 + 0.6 * vig);
  // Text sits on a spotlit box, so flowers inside it are held back to blue.
  float tone = (ground + ink * mix(1.0, 0.5, spot) * (1.0 - ground)) * (1.0 + 0.25 * lens);

  // Print: navy stock, a blue plate, then a cream plate inside it.
  vec3 print = mix(uNavy, uBlue, dotMask(d, radius(tone / 0.6) * jit, aa));
  print = mix(print, uCream, dotMask(d, radius((tone - 0.4) / 0.6) * jit, aa));

  // Paper: the same flowers as a pale ghost print (highlights only, no
  // glow), so copy on top stays readable. Freshly opened flowers print in
  // strong blue first and fade to that ghost as their ink "dries".
  float ghost = mix(smoothstep(0.18, 1.0, ink), clamp(ink, 0.0, 1.0), fresh);
  vec3 paper = mix(uCream, mix(uBlue, uNavy, 0.3 * fresh),
                   mix(0.26, 0.95, fresh) * dotMask(d, 0.62 * sqrt(ghost) * jit, aa));

  // The print's lower edge breaks up into shrinking dots, raggedly.
  float wob = fbm(c * 0.006 + 31.7 + uSeed);
  float top = uEdge - uBand * (1.0 + 1.3 * wob);
  float pp = clamp((c.y - top) / uBand, 0.0, 1.0);
  float cover = pp <= 0.0 ? 1.0 : dotMask(d, 0.8 * sqrt(1.0 - pp), aa);
  cover = max(cover, spot * (uSpotAmt > 0.995 ? 1.0 : dotMask(d, 0.8 * sqrt(uSpotAmt), aa)));

  vec3 col = mix(paper, print, cover);

  // Red plate: its own screen angle, slightly out of register. Faint on
  // paper unless the ink is fresh.
  vec2 rid;
  vec2 rc;
  float rd;
  screen(q + vec2(1.8, -1.3), 0.2618, uPitch * 0.94, rid, rc, rd);
  vec4 plate = texture2D(uInk, rc / uInkView);
  float redAmt = 0.92 * mix(mix(0.3, 1.0, cover), 1.0, plate.b);
  col = mix(col, uRed, redAmt * dotMask(rd, 0.78 * sqrt(plate.g), aa));

  // Grain and paper fibre. Static, like a real print.
  float n = hash(gl_FragCoord.xy) - 0.5;
  float fibre = vnoise(p * vec2(0.22, 1.3) + 5.0) - 0.5;
  col += n * mix(0.055, 0.11, cover) + fibre * 0.022;

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[garden] shader failed to compile:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/** Returns null when WebGL is unavailable; the page then falls back to plain CSS. */
export function createPrint(canvas) {
  const attrs = { alpha: false, antialias: false, depth: false, stencil: false };
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
  let dpr = 1;

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
      console.warn('[garden] shader failed to link:', gl.getProgramInfoLog(program));
      return false;
    }
    gl.useProgram(program);

    // One triangle that covers the whole clip space.
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
      'uInk', 'uRes', 'uInkView', 'uInkTexel', 'uDpr', 'uPitch', 'uEdge', 'uBand', 'uPointer',
      'uSpot', 'uSpotAmt', 'uSeed', 'uNavy', 'uBlue', 'uCream', 'uRed',
    ]) {
      u[name] = gl.getUniformLocation(program, name);
    }
    gl.uniform1i(u.uInk, 0);
    gl.uniform3fv(u.uNavy, rgb(PALETTE.navy));
    gl.uniform3fv(u.uBlue, rgb(PALETTE.blue));
    gl.uniform3fv(u.uCream, rgb(PALETTE.cream));
    gl.uniform3fv(u.uRed, rgb(PALETTE.red));
    return true;
  }

  if (!init()) return null;

  const onLost = (e) => e.preventDefault();
  const onRestored = () => init();
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  return {
    /** Size the drawing buffer for a w × h css-px viewport. */
    resize(w, h, pixelRatio) {
      dpr = pixelRatio;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    },

    /**
     * Upload the ink canvas and draw one frame.
     * frame: { inkView: [w, h], pitch, edge, band, pointer: [x, y, lens], spot: [l, t, r, b], spotAmt, seed }
     */
    render(inkCanvas, frame) {
      if (gl.isContextLost()) return;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, inkCanvas);
      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform2f(u.uInkView, frame.inkView[0], frame.inkView[1]);
      gl.uniform2f(u.uInkTexel, 1 / inkCanvas.width, 1 / inkCanvas.height);
      gl.uniform1f(u.uDpr, dpr);
      gl.uniform1f(u.uPitch, frame.pitch);
      gl.uniform1f(u.uEdge, frame.edge);
      gl.uniform1f(u.uBand, frame.band);
      gl.uniform3f(u.uPointer, frame.pointer[0], frame.pointer[1], frame.pointer[2]);
      gl.uniform4f(u.uSpot, frame.spot[0], frame.spot[1], frame.spot[2], frame.spot[3]);
      gl.uniform1f(u.uSpotAmt, frame.spotAmt);
      gl.uniform1f(u.uSeed, frame.seed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },

    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
}
