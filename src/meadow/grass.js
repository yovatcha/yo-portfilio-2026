import * as THREE from 'three';
import { ENV_GLSL, NOISE_GLSL, LEAF_LIGHT_GLSL, OUTPUT_GLSL } from './glsl.js';
import { HEIGHT_GLSL } from './terrain.js';
import { rng } from './util.js';

/**
 * Grass, as two square tiles of instanced blades that wrap around the walker
 * (`mod` in the vertex shader) instead of covering the whole meadow:
 *   near — fine, curved blades right around the feet
 *   far  — one triangle per blade out to the middle distance
 * Past that the scanned ground (terrain.js) carries the colour on its own.
 *
 * Blades are lit like thin leaves: sun on the face, sky in the shade, a
 * yellow-green glow when the sun is behind them, darker at the root.
 */
const COUNTS = {
  high: { near: 70000, far: 160000 },
  mid: { near: 36000, far: 80000 },
  low: { near: 18000, far: 30000 },
};

function bladeGeometry(rows) {
  // rows: [[y, halfWidth], …] ending in a tip
  const pos = [];
  const idx = [];
  rows.forEach(([y, w], r) => {
    if (r === rows.length - 1) pos.push(0, y, 0);
    else pos.push(-w, y, 0, w, y, 0);
  });
  for (let r = 0; r < rows.length - 2; r++) {
    const a = r * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const a = (rows.length - 2) * 2;
  idx.push(a, a + 1, a + 2);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

function createLayer({ env, mask, count, tile, width, height, rows, nearFade, seed }) {
  const geo = bladeGeometry(rows);
  const rand = rng(seed);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = rand();
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = count;

  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      ...env.uniforms,
      uMask: { value: mask.texture },
      uMaskMin: { value: mask.min },
      uMaskSize: { value: mask.size },
      uCenter: { value: new THREE.Vector2() },
      uWalker: { value: new THREE.Vector3() },
      uTile: { value: tile },
      uBlade: { value: new THREE.Vector2(width, height) },
      uNearFade: { value: nearFade },
      uRoot: { value: new THREE.Color(0x1c3209) },
      uLush: { value: new THREE.Color(0x3f6b17) },
      uPale: { value: new THREE.Color(0x6f8a2c) },
      uStraw: { value: new THREE.Color(0x9a8a4c) },
    },
    vertexShader: /* glsl */ `
      ${ENV_GLSL}
      ${NOISE_GLSL}
      ${HEIGHT_GLSL}
      attribute vec4 aSeed; // xy: cell in the tile, z: turn, w: size / tone
      uniform sampler2D uMask;
      uniform vec2 uMaskMin;
      uniform vec2 uMaskSize;
      uniform vec2 uCenter;
      uniform vec3 uWalker;
      uniform float uTile;
      uniform vec2 uBlade;
      uniform vec2 uNearFade;
      varying float vK;
      varying float vTone;
      varying vec2 vW;
      varying vec3 vPos;
      varying vec3 vN;
      varying float vDist;
      void main() {
        // Wrap the tile around its centre: each blade keeps a fixed world spot.
        vec2 rel = mod(aSeed.xy * uTile - uCenter, uTile) - 0.5 * uTile;
        vec2 w = uCenter + rel;
        float edge = max(abs(rel.x), abs(rel.y)) / (0.5 * uTile);
        float grow = 1.0 - smoothstep(0.7, 1.0, edge);
        grow *= smoothstep(uNearFade.x, uNearFade.y, distance(w, uWalker.xz));

        vec4 mk = texture2D(uMask, (w - uMaskMin) / uMaskSize);
        grow *= 1.0 - clamp(mk.r * 0.95 + mk.g * 0.9, 0.0, 0.96);
        grow *= 1.0 - uMap * 0.75;

        float lush = grassPatch(w);
        float h = uBlade.y * (0.35 + aSeed.w * aSeed.w * 1.5) * (0.6 + lush * 0.8) * grow;
        float ang = aSeed.z * 6.2831853;
        vec2 face = vec2(cos(ang), sin(ang));
        vec2 faceN = vec2(-face.y, face.x); // the way the blade faces
        float y = position.y;

        float sway = sin(uTime * 1.3 + w.x * 0.22 + w.y * 0.31) * 0.5
                   + sin(uTime * 2.7 + w.x * 0.9 - w.y * 0.6 + ang) * 0.25;
        float bend = (0.08 + 0.09 * sway + 0.2 * gust(w)) * uWind;
        // every blade droops its own way; taller ones droop more
        vec2 droop = faceN * (0.15 + fract(aSeed.w * 7.3) * 0.75);
        vec2 lean = (vec2(1.0, 0.35) * bend + droop) * y * y;

        vec3 p = vec3(w.x, heightAt(w), w.y);
        p.xz += face * position.x * uBlade.x * (0.7 + fract(aSeed.w * 3.1) * 0.6) * step(0.001, grow);
        p.xz += lean * h;
        p.y += y * h * (1.0 - 0.18 * dot(lean, lean));

        // Normal: the blade's face, rolled back as it droops, softened towards up.
        vec3 n = normalize(vec3(faceN.x, 0.55 + y * 0.9, faceN.y));
        vK = y;
        vTone = fract(aSeed.w * 11.7) * 0.75 + lush * 0.25;
        vW = w;
        vPos = p;
        vN = n;
        vDist = distance(p, cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      ${ENV_GLSL}
      ${NOISE_GLSL}
      ${LEAF_LIGHT_GLSL}
      uniform vec3 uRoot;
      uniform vec3 uLush;
      uniform vec3 uPale;
      uniform vec3 uStraw;
      varying float vK;
      varying float vTone;
      varying vec2 vW;
      varying vec3 vPos;
      varying vec3 vN;
      varying float vDist;
      void main() {
        // lush → paler green, with the odd dry stalk
        vec3 tip = mix(uLush, uPale, smoothstep(0.2, 0.85, vTone));
        tip = mix(tip, uStraw, smoothstep(0.9, 0.97, vTone));
        vec3 albedo = mix(uRoot, tip, smoothstep(0.0, 0.75, vK));

        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n.xz = -n.xz;
        vec3 view = normalize(cameraPosition - vPos);
        vec3 col = leafLight(albedo, n, view, cloudShade(vW), vK);
        // a little sheen on the upper blade
        col += uSunCol * pow(max(dot(n, normalize(view + uSunDir)), 0.0), 28.0) * 0.02 * vK;
        // roots sit in each other's shade
        col *= mix(0.3, 1.0, smoothstep(0.0, 0.6, vK));

        gl_FragColor = vec4(col, 1.0);
        ${OUTPUT_GLSL}
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, geo, mat, count, tile };
}

export function createGrass({ env, mask, tier }) {
  const n = COUNTS[tier];
  const lowTier = tier === 'low';
  const near = createLayer({
    env,
    mask,
    count: n.near,
    tile: lowTier ? 10 : 13,
    width: 0.0065,
    height: 0.34,
    rows: lowTier
      ? [[0, 1], [0.55, 0.7], [1, 0]]
      : [[0, 1], [0.4, 0.88], [0.75, 0.5], [1, 0]],
    nearFade: new THREE.Vector2(-2, -1), // never fades
    seed: 11,
  });
  const far = createLayer({
    env,
    mask,
    count: n.far,
    tile: 52,
    width: 0.017,
    height: 0.4,
    rows: [[0, 1], [1, 0]],
    nearFade: new THREE.Vector2(3, 6),
    seed: 23,
  });

  const group = new THREE.Group();
  group.add(far.mesh, near.mesh);
  const fwd = new THREE.Vector2();

  return {
    group,
    /** Centre the tiles a little ahead of the walker, where the camera looks. */
    follow(pos, target) {
      fwd.set(target.x - pos.x, target.z - pos.z).normalize();
      [near, far].forEach((l) => {
        l.mat.uniforms.uCenter.value.set(pos.x + fwd.x * l.tile * 0.3, pos.z + fwd.y * l.tile * 0.3);
        l.mat.uniforms.uWalker.value.copy(pos);
      });
    },
    /** Adaptive quality: instances are in random order, so this thins evenly. */
    setDensity(k) {
      near.geo.instanceCount = Math.floor(near.count * k);
      far.geo.instanceCount = Math.floor(far.count * k);
    },
  };
}
