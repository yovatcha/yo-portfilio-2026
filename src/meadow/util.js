import * as THREE from 'three';

// The meadow's shaders write display-space colour straight to the framebuffer
// (no tone mapping, no colour-space pass — that is what keeps the sky azure),
// so colours are kept as raw sRGB triplets instead of THREE.Color.
export const rgb = (h) => new THREE.Vector3(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255);

// Small seeded PRNG (mulberry32) so the field looks the same on every visit.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Canvas → texture. `srgb` is for three's built-in materials (sprites, points);
// our own shaders sample the raw values.
export function makeCanvasTexture(width, height, { srgb = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, ctx, texture };
}

// Read a CSS custom property so canvas drawings use the same fonts as the page.
export const cssVar = (name, fallback) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
