import * as THREE from 'three';
import { rgb } from './util.js';

/**
 * Time of day. One number — `day`, 0 = midday … 1 = last light — drives the
 * sun, the sky light, the haze and which photographed sky is overhead. The
 * walk from hero to contact is the walk through the afternoon.
 *
 * Each key belongs to one sky photo. `sunU` is where the sun sits in that
 * photo (measured from the image), and `az` / `el` are where we want the sun
 * in the world; the dome is turned so the two agree, and the directional light
 * comes from the same place.
 */
const deg = THREE.MathUtils.degToRad;
const KEYS = [
  // midday, towering cumulus — sun high on the left
  { at: 0, sunU: 0.59, az: deg(-132), el: deg(48), sun: 0xfff3dc, sunI: 3.4, sky: 0xbdd6ff, ground: 0x6f7d45, hemiI: 1.25, fog: 0xc3d0e2 },
  // late afternoon, clear and low
  { at: 0.6, sunU: 0.598, az: deg(-112), el: deg(20), sun: 0xffd9a6, sunI: 3.0, sky: 0xaec6e8, ground: 0x7d7a4a, hemiI: 1.05, fog: 0xcfd3d8 },
  // sunset breaking under the clouds, straight down the path
  { at: 1, sunU: 0.59, az: deg(-96), el: deg(9), sun: 0xffb37a, sunI: 2.5, sky: 0x9bb0d6, ground: 0x7a6c55, hemiI: 0.95, fog: 0xc9b9a6 },
];

const FOG_DENSITY = 0.0024;
const TAU = Math.PI * 2;

const dirOf = (az, el, out) => out.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
// Dome rotation that puts the photo's sun at azimuth `az` (see sky.js).
const offsetOf = (k) => k.sunU - k.az / TAU - 0.5;

export function createEnv() {
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x777777, 1);
  const fog = new THREE.FogExp2(KEYS[0].fog, FOG_DENSITY);

  // The custom shaders (grass, scattered plants, sky) read the same values.
  const uniforms = {
    uTime: { value: 0 },
    uWind: { value: 1 },
    uMap: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Vector3(1, 1, 1) }, // linear, × intensity
    uSkyCol: { value: new THREE.Vector3(1, 1, 1) },
    uGroundCol: { value: new THREE.Vector3(1, 1, 1) },
    uFog: { value: rgb(KEYS[0].fog) }, // display space, like scene.fog
    uFogDensity: { value: FOG_DENSITY },
    uSkyA: { value: null },
    uSkyB: { value: null },
    uSkyOffA: { value: 0 },
    uSkyOffB: { value: 0 },
    uSkyMix: { value: 0 },
  };

  const skies = [null, null, null];
  const a = new THREE.Color();
  const b = new THREE.Color();
  const da = new THREE.Vector3();
  const db = new THREE.Vector3();
  const lerpColor = (ka, kb, k, target) => target.copy(a.set(ka)).lerp(b.set(kb), k);
  const state = { segment: 0, k: 0 };

  return {
    sun,
    hemi,
    fog,
    uniforms,
    state,
    setSky(i, texture) {
      skies[i] = texture;
    },
    skyTexture: (i) => skies[i],
    /** @param day 0..1 @param map 0 = walking, 1 = bird's-eye map */
    update(day, map) {
      let i = 0;
      while (i < KEYS.length - 2 && day > KEYS[i + 1].at) i++;
      const ka = KEYS[i];
      const kb = KEYS[i + 1];
      const k = THREE.MathUtils.clamp((day - ka.at) / (kb.at - ka.at), 0, 1);
      state.segment = i;
      state.k = k;

      dirOf(ka.az, ka.el, da);
      dirOf(kb.az, kb.el, db);
      uniforms.uSunDir.value.lerpVectors(da, db, k).normalize();

      lerpColor(ka.sun, kb.sun, k, sun.color);
      sun.intensity = THREE.MathUtils.lerp(ka.sunI, kb.sunI, k);
      lerpColor(ka.sky, kb.sky, k, hemi.color);
      lerpColor(ka.ground, kb.ground, k, hemi.groundColor);
      hemi.intensity = THREE.MathUtils.lerp(ka.hemiI, kb.hemiI, k);
      lerpColor(ka.fog, kb.fog, k, fog.color);
      // From above there is far more air between the camera and the ground.
      fog.density = FOG_DENSITY * (1 - 0.82 * map);

      uniforms.uSunCol.value.set(sun.color.r, sun.color.g, sun.color.b).multiplyScalar(sun.intensity);
      uniforms.uSkyCol.value.set(hemi.color.r, hemi.color.g, hemi.color.b).multiplyScalar(hemi.intensity);
      uniforms.uGroundCol.value.set(hemi.groundColor.r, hemi.groundColor.g, hemi.groundColor.b).multiplyScalar(hemi.intensity);
      uniforms.uFog.value.lerpVectors(rgb(ka.fog), rgb(kb.fog), k);
      uniforms.uFogDensity.value = fog.density;
      uniforms.uMap.value = map;

      // Hold each photo pure around its stop; cross-fade while walking between.
      uniforms.uSkyA.value = skies[i] ?? skies[0];
      uniforms.uSkyB.value = skies[i + 1] ?? skies[i] ?? skies[0];
      uniforms.uSkyOffA.value = offsetOf(ka);
      uniforms.uSkyOffB.value = offsetOf(kb);
      uniforms.uSkyMix.value = skies[i + 1] ? THREE.MathUtils.smoothstep(k, 0.2, 0.8) : 0;
    },
  };
}
