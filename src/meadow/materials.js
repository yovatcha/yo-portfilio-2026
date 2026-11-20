import * as THREE from 'three';

// Paint colours for the hand-built props. The CSS tokens in style.css echo these.
export const PALETTE = {
  coral: 0xb8402c,
  sun: 0xe0a916,
  steel: 0xb4b9c2,
};

/**
 * Surfaces for the props that have no scanned model (signpost, mailbox,
 * stump, name stakes): scanned wood, bark and sheet-metal relief. Every call returns a fresh material so a
 * hover glow on one landmark doesn't light the others.
 */
export function createMaterials({ assets, tier }) {
  const full = tier !== 'low';
  const set = (name, repeat) => ({
    map: assets.texture(`textures/${name}/diff.jpg`, { srgb: true, repeat }),
    normalMap: full ? assets.texture(`textures/${name}/nor_gl.jpg`, { repeat }) : null,
  });

  return {
    /** Weathered planks. `tint` darkens or warms the scan. */
    wood: (tint = 0xffffff, repeat = 1) =>
      new THREE.MeshStandardMaterial({ ...set('weathered_brown_planks', repeat), color: tint, roughness: 0.9 }),
    bark: (repeat = 1) => new THREE.MeshStandardMaterial({ ...set('bark_brown_02', repeat), roughness: 1 }),
    /** Painted sheet metal in any colour: the scan's scratches and dents, our paint. */
    enamel: (color) =>
      new THREE.MeshStandardMaterial({
        color,
        normalMap: full ? assets.texture('textures/blue_metal_plate/nor_gl.jpg') : null,
        roughness: 0.5,
        metalness: 0.15,
      }),
    /** Plain painted or moulded surface. */
    plain: (color, { roughness = 0.7, metalness = 0 } = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness }),
  };
}

/** Turn a model's leaves into blossom: keep the scan's light and dark, swap its hue. */
export function blossom(material, color) {
  const m = material.clone();
  const tint = new THREE.Color(color);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBlossom = { value: tint };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uBlossom;')
      .replace(
        '#include <map_fragment>',
        /* glsl */ `#include <map_fragment>
        {
          float bl = dot(diffuseColor.rgb, vec3(0.3, 0.6, 0.1));
          diffuseColor.rgb = mix(diffuseColor.rgb, uBlossom * (0.35 + bl * 4.5), 0.86);
        }`
      );
  };
  m.customProgramCacheKey = () => `blossom-${color}`;
  return m;
}
