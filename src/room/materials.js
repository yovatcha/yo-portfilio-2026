import * as THREE from 'three';

// Shared palette for the room. Mirrors the CSS tokens in style.css so the 3D
// and the HTML read as one piece: warm lamp amber, cool monitor cyan and one
// loud neon magenta.
export const PALETTE = {
  wall: 0x302d4a,
  wallDark: 0x221f36,
  floor: 0x4a3830,
  wood: 0x5a4134,
  woodLight: 0x7a5a45,
  metal: 0x45454f,
  black: 0x1c1c24,
  cream: 0xe9e2d4,
  neon: 0xff3d8b,
  cyan: 0x4ff3ff,
  amber: 0xffb45e,
  plant: 0x2f6b4f,
};

// Matte clay-ish material — the room is stylised, never glossy.
export const clay = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0.05,
    ...extra,
  });

// Self-lit material that blows past 1.0 so the bloom pass picks it up.
export const glow = (color, intensity = 2) => {
  const m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  m.color.multiplyScalar(intensity);
  return m;
};

// Hi-DPI canvas → texture helper used by the monitor, phone, sign and orbs.
export function makeCanvasTexture(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, ctx, texture };
}

// Read a CSS custom property so canvas drawings use the same fonts as the page.
export const cssVar = (name, fallback) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
  fallback;
