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

// Plain material for small coloured props (books, sleeves, leaves…).
export const clay = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0.05,
    ...extra,
  });

// Glossy coated surfaces: plastic, ceramic, vinyl.
export const coated = (color, extra = {}) =>
  new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.4,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    ...extra,
  });

// ---------- Scanned PBR sets (src/public/textures, CC0 from Poly Haven) ----------
// Each set is diff (albedo) + nor_gl (normal) + arm (AO / roughness / metal).
// Base textures load once; each material gets its own clone for its repeat.

const texConfig = { manager: undefined, anisotropy: 4, full: true };
const sets = new Map();

export function configureTextures({ manager, anisotropy, full }) {
  Object.assign(texConfig, { manager, anisotropy, full });
}

function baseTexture(path, srgb) {
  if (sets.has(path)) return sets.get(path);
  const record = { loaded: false, clones: [] };
  record.tex = new THREE.TextureLoader(texConfig.manager).load(path, () => {
    record.loaded = true;
    // clones made before the image arrived share its Source but need a re-upload
    record.clones.forEach((c) => (c.needsUpdate = true));
  });
  record.tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  sets.set(path, record);
  return record;
}

function repeated(path, srgb, [rx, ry]) {
  const record = baseTexture(path, srgb);
  const t = record.tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = texConfig.anisotropy;
  if (record.loaded) t.needsUpdate = true;
  else record.clones.push(t);
  return t;
}

/**
 * Scanned material, e.g. pbr('walnut', { repeat: [2, 1] }).
 * `color` tints the albedo — used to push plaster into the night palette.
 */
export function pbr(name, { repeat = [1, 1], color = 0xffffff, normalScale = 1, ...extra } = {}) {
  const dir = `textures/${name}`;
  const params = {
    color,
    map: repeated(`${dir}/diff.jpg`, true, repeat),
    roughness: 1,
    metalness: 0,
    ...extra,
  };
  if (texConfig.full) {
    const arm = repeated(`${dir}/arm.jpg`, false, repeat);
    Object.assign(params, {
      normalMap: repeated(`${dir}/nor_gl.jpg`, false, repeat),
      normalScale: new THREE.Vector2(normalScale, normalScale),
      aoMap: arm,
      roughnessMap: arm,
      metalnessMap: arm,
      ...extra,
    });
  } else {
    params.roughness = extra.roughness ?? 0.75;
  }
  return new THREE.MeshStandardMaterial(params);
}

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
