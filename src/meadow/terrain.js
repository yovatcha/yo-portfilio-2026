import * as THREE from 'three';
import { NOISE_GLSL } from './glsl.js';

/**
 * The ground. One height function, written once as constants and emitted as
 * both JS (camera, landmarks, trees) and GLSL (grass and flowers place
 * themselves on the ground in the vertex shader).
 */
// [kx, kz, phase, amplitude]
const WAVES = [
  [0.031, 0.017, 0.4, 1.6],
  [-0.013, 0.043, 2.1, 1.1],
  [0.071, -0.052, 4.2, 0.35],
  [0.11, 0.09, 1.3, 0.16],
];
// The path runs along a shallow valley; the sides rise into tree-topped ridges.
const VALLEY_RISE = 9;
const VALLEY_WIDTH = 30;

export function heightAt(x, z) {
  let h = 0;
  for (const [kx, kz, ph, a] of WAVES) h += a * Math.sin(x * kx + z * kz + ph);
  return h + VALLEY_RISE * (1 - Math.exp(-(x * x) / (VALLEY_WIDTH * VALLEY_WIDTH)));
}

const f = (n) => `(${Number(n).toFixed(5)})`;
export const HEIGHT_GLSL = /* glsl */ `
  float heightAt(vec2 p) {
    float h = 0.0;
    ${WAVES.map(([kx, kz, ph, a]) => `h += ${f(a)} * sin(p.x * ${f(kx)} + p.y * ${f(kz)} + ${f(ph)});`).join('\n    ')}
    return h + ${f(VALLEY_RISE)} * (1.0 - exp(-(p.x * p.x) / ${f(VALLEY_WIDTH * VALLEY_WIDTH)}));
  }
`;

const SIZE = 900;
const CENTER_Z = -80;
const TILE = 2.6; // metres per repeat of the scanned ground

// What the turf under the blades averages out to; the blades in grass.js are
// coloured to meet it, so thinning with distance doesn't show.
export const TURF = new THREE.Color(0x3d6418);

export function createTerrain({ env, mask, assets, tier }) {
  const seg = { high: 200, mid: 150, low: 100 }[tier];
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, CENTER_Z);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
    uv.setXY(i, pos.getX(i) / TILE, pos.getZ(i) / TILE);
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    map: assets.texture('textures/leafy_grass/diff.jpg', { srgb: true }),
    normalMap: tier === 'low' ? null : assets.texture('textures/leafy_grass/nor_gl.jpg'),
    roughness: 0.96,
    metalness: 0,
  });
  const pathTex = assets.texture('textures/grass_path_2/diff.jpg', { srgb: true });

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uTime: env.uniforms.uTime,
      uMap: env.uniforms.uMap,
      uPathTex: { value: pathTex },
      uMask: { value: mask.texture },
      uMaskMin: { value: mask.min },
      uMaskSize: { value: mask.size },
      uTurf: { value: TURF },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGround;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uTime;
        uniform float uMap;
        uniform sampler2D uPathTex;
        uniform sampler2D uMask;
        uniform vec2 uMaskMin;
        uniform vec2 uMaskSize;
        uniform vec3 uTurf;
        varying vec3 vGround;
        ${NOISE_GLSL}`
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        vec2 gw = vGround.xz;
        float gDist = distance(vGround, cameraPosition);
        // Two scales of the same scan, so the tile never reads as a grid.
        vec3 scan = mix(texture2D(map, vMapUv).rgb, texture2D(map, vMapUv * 0.19 + 0.37).rgb, 0.45);
        // The scan is a worn, leaf-littered lawn; keep its texture, grow it back.
        float lum = dot(scan, vec3(0.3, 0.6, 0.1));
        vec3 turf = mix(scan, uTurf * (0.45 + lum * 3.6), 0.78) * (0.8 + grassPatch(gw) * 0.4);
        // From far off the scan blurs to one flat green; broad drier and darker
        // swathes keep the hillsides from looking like plastic.
        float broad = vnoise(gw * 0.021 + 4.0) * 0.6 + vnoise(gw * 0.006) * 0.4;
        float streak = vnoise(vec2(gw.x * 0.35 + gw.y * 0.12, gw.y * 0.05));
        turf *= 0.72 + broad * 0.5 + (streak - 0.5) * 0.16 * smoothstep(20.0, 60.0, gDist);
        turf = mix(turf, turf.ggr * vec3(1.05, 0.95, 0.7), smoothstep(0.55, 0.85, broad) * 0.35);

        vec4 mk = texture2D(uMask, (gw - uMaskMin) / uMaskSize);
        // Bare earth where feet (and flower beds) are, breaking up along the scan's own detail.
        float worn = smoothstep(0.3, 0.75, mk.r * 0.95 + mk.g * 0.9 + (lum - 0.2) * 0.9);
        vec3 earth = texture2D(uPathTex, vMapUv * 0.8).rgb;
        vec3 groundCol = mix(turf, earth, worn * mix(0.85, 0.35, uMap));

        // Distant flowers are only a scatter of pale specks.
        vec2 fg = gw * 2.6;
        float fr = hash21(floor(fg));
        vec2 fo = vec2(hash21(floor(fg) + 3.1), hash21(floor(fg) + 7.7)) - 0.5;
        float speck = smoothstep(0.13, 0.05, length(fract(fg) - 0.5 - fo * 0.6)) * step(0.9, fr);
        speck *= smoothstep(14.0, 26.0, gDist) * (1.0 - smoothstep(70.0, 130.0, gDist)) * (1.0 - worn) * (1.0 - uMap);
        groundCol = mix(groundCol, fr > 0.965 ? vec3(0.9, 0.7, 0.08) : vec3(0.85), speck * 0.7);

        // On the map, the route is painted on.
        groundCol = mix(groundCol, vec3(0.92, 0.88, 0.76), mk.b * uMap * 0.9);

        diffuseColor.rgb *= groundCol * cloudShade(gw);
        `
      );
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}
