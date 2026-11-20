import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ENV_GLSL, NOISE_GLSL, LEAF_LIGHT_GLSL, OUTPUT_GLSL } from './glsl.js';
import { HEIGHT_GLSL } from './terrain.js';
import { bakeModel } from './assets.js';
import { rng } from './util.js';

/**
 * Everything small that grows in the grass: ox-eye daisies (built here as
 * real petal geometry — there is no scanned one), and scanned patches of
 * celandine, grass tussocks and ferns. Each kind is one instanced mesh whose
 * instances wrap around the walker, the same trick the grass uses, so only
 * the plants near you are ever drawn.
 */

// ---------- a daisy, at life size (metres) ----------
function daisyGeometry() {
  const parts = [];
  const paint = (g, r, gr, b) => {
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set([r, gr, b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g.index ? g.toNonIndexed() : g;
  };
  const H = 0.3;
  // Triangle counts matter more than anything here (thousands of instances):
  // a three-sided stem, one quad per petal, a six-sided button.
  parts.push(paint(new THREE.CylinderGeometry(0.0012, 0.0018, H, 3, 1, true).translate(0, H / 2, 0), 0.16, 0.32, 0.06));

  const PETALS = 13;
  for (let i = 0; i < PETALS; i++) {
    const a = (i / PETALS) * Math.PI * 2;
    const w = 0.0034;
    const g = new THREE.BufferGeometry();
    // a strap, narrow at the button, drooping a little at the tip
    g.setAttribute('position', new THREE.Float32BufferAttribute([-w * 0.4, 0, 0.004, w * 0.4, 0, 0.004, w, -0.001, 0.023, -w * 0.4, 0, 0.004, w, -0.001, 0.023, -w, -0.001, 0.023], 3));
    g.rotateX(-0.1 + (i % 3) * 0.06); // petals never sit perfectly flat
    g.rotateY(a);
    g.translate(0, H, 0);
    g.computeVertexNormals();
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(12), 2));
    parts.push(paint(g, 0.92, 0.92, 0.88));
  }
  const disc = new THREE.ConeGeometry(0.0052, 0.003, 6, 1, true).translate(0, H + 0.0015, 0);
  parts.push(paint(disc, 0.85, 0.6, 0.04));
  // the cylinder and sphere carry uv/normal already; give every part the same set
  parts.forEach((g) => g.attributes.uv || g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)));
  return mergeGeometries(parts);
}

// ---------- one wrapped, instanced kind of plant ----------
function createScatter({ env, mask, geometry, map = null, alphaTest = 0.5, count, tile, scale = [0.8, 1.2], tilt = 0.25, sway = 1, thin = 0.6, drift = 0, seed }) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = geometry.index;
  Object.entries(geometry.attributes).forEach(([name, attr]) => geo.setAttribute(name, attr));
  if (!geo.attributes.color) {
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
  }
  const rand = rng(seed);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = rand();
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = count;

  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      ...env.uniforms,
      uTex: { value: map },
      uUseTex: { value: map ? 1 : 0 },
      uAlphaTest: { value: alphaTest },
      uMask: { value: mask.texture },
      uMaskMin: { value: mask.min },
      uMaskSize: { value: mask.size },
      uCenter: { value: new THREE.Vector2() },
      uTile: { value: tile },
      uScale: { value: new THREE.Vector2(...scale) },
      uTilt: { value: tilt },
      uSway: { value: sway },
      uThin: { value: thin },
      uDrift: { value: drift },
    },
    vertexShader: /* glsl */ `
      ${ENV_GLSL}
      ${NOISE_GLSL}
      ${HEIGHT_GLSL}
      attribute vec4 aSeed; // xy: cell, z: turn, w: size
      attribute vec3 color;
      uniform sampler2D uMask;
      uniform vec2 uMaskMin;
      uniform vec2 uMaskSize;
      uniform vec2 uCenter;
      uniform float uTile;
      uniform vec2 uScale;
      uniform float uTilt;
      uniform float uSway;
      uniform float uDrift;
      varying vec2 vUv;
      varying vec3 vCol;
      varying vec3 vPos;
      varying vec3 vN;
      varying vec2 vW;
      varying float vDist;
      mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
      mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
      void main() {
        vec2 rel = mod(aSeed.xy * uTile - uCenter, uTile) - 0.5 * uTile;
        vec2 w = uCenter + rel;
        float edge = max(abs(rel.x), abs(rel.y)) / (0.5 * uTile);
        float grow = 1.0 - smoothstep(0.78, 1.0, edge);
        vec4 mk = texture2D(uMask, (w - uMaskMin) / uMaskSize);
        grow *= 1.0 - smoothstep(0.12, 0.45, mk.r + mk.g);
        // plants come in drifts, not an even sprinkle
        grow *= mix(1.0, smoothstep(0.38, 0.55, vnoise(w * 0.09 + uDrift)), step(0.001, uDrift));

        mat3 turn = rotY(aSeed.z * 6.2831853) * rotX((fract(aSeed.w * 5.3) - 0.5) * 2.0 * uTilt);
        float s = mix(uScale.x, uScale.y, aSeed.w) * grow * (1.0 - uMap * 0.5);
        vec3 local = turn * position * s;
        float lift = max(local.y, 0.0);
        float push = (sin(uTime * 1.3 + w.x * 0.22 + w.y * 0.31) * 0.06 + gust(w) * 0.12) * uWind * uSway;
        local.xz += vec2(1.0, 0.35) * push * lift * (1.0 + lift * 2.0);

        vec3 p = vec3(w.x, heightAt(w), w.y) + local;
        vUv = uv;
        vCol = color;
        vPos = p;
        vN = turn * normal;
        vW = w;
        vDist = distance(p, cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      ${ENV_GLSL}
      ${NOISE_GLSL}
      ${LEAF_LIGHT_GLSL}
      uniform sampler2D uTex;
      uniform float uUseTex;
      uniform float uAlphaTest;
      uniform float uThin;
      varying vec2 vUv;
      varying vec3 vCol;
      varying vec3 vPos;
      varying vec3 vN;
      varying vec2 vW;
      varying float vDist;
      void main() {
        vec3 albedo = vCol;
        if (uUseTex > 0.5) {
          vec4 t = texture2D(uTex, vUv);
          if (t.a < uAlphaTest) discard;
          albedo *= t.rgb * 1.5;
        }
        vec3 n = normalize(vN);
        vec3 view = normalize(cameraPosition - vPos);
        if (dot(n, view) < 0.0) n = -n;
        // lean the normal up: thin leaves and petals catch the whole sky
        n = normalize(n + vec3(0.0, 0.6, 0.0));
        gl_FragColor = vec4(leafLight(albedo, n, view, cloudShade(vW), uThin), 1.0);
        ${OUTPUT_GLSL}
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, mat, tile };
}

// The scans are whole patches about a metre across (a mat of celandine, a
// tussock of grass, a spread of fern), so a few dozen go a long way.
const PLANTS = {
  // model: instances per tier, tile (m), size range, …
  celandine_01: { counts: { high: 30, mid: 14, low: 0 }, tile: 26, scale: [0.8, 1.3], drift: 3, seed: 51 },
  grass_medium_02: { counts: { high: 30, mid: 14, low: 0 }, tile: 26, scale: [0.7, 1.25], sway: 1.4, alphaTest: 0.25, seed: 53 },
  fern_02: { counts: { high: 8, mid: 4, low: 0 }, tile: 44, scale: [0.5, 0.9], sway: 0.6, drift: 19, seed: 54 },
};

export function createFlowers({ env, mask, assets, tier }) {
  const group = new THREE.Group();
  const layers = [];
  const add = (layer) => {
    layers.push(layer);
    group.add(layer.mesh);
  };

  add(
    createScatter({
      env,
      mask,
      geometry: daisyGeometry(),
      count: { high: 6500, mid: 3200, low: 1200 }[tier],
      tile: 24,
      scale: [0.9, 1.9],
      tilt: 0.4,
      thin: 0.25,
      drift: 5,
      seed: 41,
    })
  );

  Object.entries(PLANTS).forEach(([name, cfg]) => {
    const count = cfg.counts[tier];
    if (!count) return;
    assets.model(name).then((scene) => {
      if (!scene) return;
      const { geometry, material } = bakeModel(scene);
      add(createScatter({ env, mask, geometry, map: material.map, alphaTest: material.alphaTest || 0.4, count, ...cfg }));
    });
  });

  const fwd = new THREE.Vector2();
  return {
    group,
    follow(pos, target) {
      fwd.set(target.x - pos.x, target.z - pos.z).normalize();
      layers.forEach((l) => l.mat.uniforms.uCenter.value.set(pos.x + fwd.x * l.tile * 0.3, pos.z + fwd.y * l.tile * 0.3));
    },
  };
}
