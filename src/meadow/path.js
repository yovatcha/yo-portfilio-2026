import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { makeCanvasTexture } from './util.js';

/**
 * The walk: one spline through the valley, heading towards the far hill and
 * the evening sun. Everything is addressed by `u`, the arc-length fraction.
 */
const POINTS = [
  [0, 6],
  [1.5, -14],
  [-4, -36],
  [3.5, -60],
  [-2.5, -84],
  [4, -108],
  [0.5, -130],
  [0, -156],
];

export const curve = new THREE.CatmullRomCurve3(
  POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  false,
  'catmullrom',
  0.5
);
export const PATH_LENGTH = curve.getLength();

const clamp01 = (u) => Math.max(0, Math.min(1, u));

/** Point on the path, sitting on the ground. */
export function pathPoint(u, out) {
  curve.getPointAt(clamp01(u), out);
  out.y = heightAt(out.x, out.z);
  return out;
}

const tan = new THREE.Vector3();
/** Unit vector to the walker's right at `u` (flat). */
export function pathRight(u, out) {
  curve.getTangentAt(clamp01(u), tan);
  return out.set(-tan.z, 0, tan.x).normalize();
}
export function pathForward(u, out) {
  curve.getTangentAt(clamp01(u), out);
  out.y = 0;
  return out.normalize();
}

// World rectangle the mask covers (square texels).
const MIN = new THREE.Vector2(-50, -175);
const SIZE = new THREE.Vector2(100, 200);
const W = 512;
const H = 1024;

/**
 * Ground mask sampled by the terrain, the grass and the flowers:
 *   R  the trodden line          G  clearings around landmarks
 *   B  the dashed route shown on the map
 * @param clearings [{ x, z, r }] in metres
 */
export function createPathMask(clearings) {
  const { ctx, texture } = makeCanvasTexture(W, H);
  const s = W / SIZE.x; // px per metre
  const px = (x) => (x - MIN.x) * s;
  const py = (z) => (MIN.y + SIZE.y - z) * s; // texture is flipped: v grows with z

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const pts = curve.getSpacedPoints(240);
  const trace = () => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(px(p.x), py(p.z)) : ctx.moveTo(px(p.x), py(p.z))));
  };

  // Soft-edged line, built from stacked strokes (canvas blur isn't universal).
  [
    [3.2, 0.22],
    [2.2, 0.3],
    [1.3, 0.48],
  ].forEach(([width, alpha]) => {
    trace();
    ctx.strokeStyle = `rgba(255,0,0,${alpha})`;
    ctx.lineWidth = width * s;
    ctx.stroke();
  });

  clearings.forEach(({ x, z, r }) => {
    const g = ctx.createRadialGradient(px(x), py(z), 0, px(x), py(z), r * s);
    g.addColorStop(0, 'rgba(0,255,0,1)');
    g.addColorStop(0.7, 'rgba(0,255,0,0.85)');
    g.addColorStop(1, 'rgba(0,255,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px(x - r), py(z + r), r * 2 * s, r * 2 * s);
  });

  trace();
  ctx.setLineDash([2.4 * s, 1.9 * s]);
  ctx.strokeStyle = 'rgb(0,0,255)';
  ctx.lineWidth = 1.1 * s;
  ctx.stroke();

  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, min: MIN, size: SIZE };
}
