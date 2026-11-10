import * as THREE from 'three';

/**
 * Camera "stations" — one per page section, in DOM order.
 *
 * `shift` slides the framed object sideways (fraction of screen width) so it
 * sits beside the docked HTML panel instead of underneath it:
 * negative → object on the left (panel on the right), positive → the reverse.
 * Implemented with camera.setViewOffset, so the perspective stays natural.
 */
export const STATIONS = [
  { id: 'hero', pos: [6.4, 4.6, 6.6], target: [-0.4, 1.3, -1.6], shift: 0.16, parallax: 1 },
  { id: 'about', pos: [-0.05, 1.22, -1.55], target: [-0.6, 0.92, -2.72], shift: -0.2, parallax: 0.35 },
  { id: 'projects', pos: [0.72, 1.4, -1.25], target: [0.42, 1.32, -3.0], shift: 0.23, parallax: 0.35 },
  { id: 'skills', pos: [2.35, 1.75, -0.6], target: [3.1, 0.98, -2.95], shift: -0.2, parallax: 0.35 },
  { id: 'music', pos: [-2.25, 1.7, -1.35], target: [-2.9, 0.8, -3.05], shift: 0.2, parallax: 0.35 },
  { id: 'faq', pos: [-1.2, 1.95, 0.4], target: [-4.5, 2.05, -1.25], shift: -0.2, parallax: 0.45 },
  { id: 'contact', pos: [1.85, 1.55, -1.75], target: [1.5, 0.79, -2.45], shift: 0.2, parallax: 0.35 },
].map((s) => ({ ...s, pos: new THREE.Vector3(...s.pos), target: new THREE.Vector3(...s.target) }));

export const stationIndex = (id) => STATIONS.findIndex((s) => s.id === id);

const smooth = (t) => t * t * (3 - 2 * t);

/**
 * Maps scroll position → a float station index (e.g. 2.4 = 40% of the way
 * from projects to skills). Each section "holds" its station while it fills
 * the viewport; the camera only travels around the section boundaries.
 */
export function createStationTracker() {
  const sections = STATIONS.map((s) => document.getElementById(s.id));
  let bounds = [];

  function measure() {
    bounds = sections.map((el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
    });
  }
  measure();
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
  // Content height changes (Spotify iframe, fonts) shift the bounds.
  const ro = 'ResizeObserver' in window ? new ResizeObserver(measure) : null;
  ro?.observe(document.body);

  return {
    read() {
      const vh = window.innerHeight;
      const y = window.scrollY + vh * 0.5;
      const band = vh * 0.35;
      for (let i = 0; i < bounds.length - 1; i++) {
        const b = bounds[i + 1]?.top;
        if (b == null) continue;
        if (y < b - band) return i;
        if (y < b + band) return i + smooth((y - (b - band)) / (band * 2));
      }
      return bounds.length - 1;
    },
    dispose() {
      window.removeEventListener('resize', measure);
      window.removeEventListener('load', measure);
      ro?.disconnect();
    },
  };
}

/**
 * Interpolated camera pose for a float station index.
 */
export function poseAt(f, out) {
  const i = Math.max(0, Math.min(STATIONS.length - 1, Math.floor(f)));
  const j = Math.min(STATIONS.length - 1, i + 1);
  const t = f - i;
  const a = STATIONS[i];
  const b = STATIONS[j];
  out.pos.lerpVectors(a.pos, b.pos, t);
  out.target.lerpVectors(a.target, b.target, t);
  // Arc the move up and back a little so the camera never clips furniture.
  const lift = Math.sin(t * Math.PI) * (i === 0 ? 0 : 0.6);
  out.pos.y += lift;
  out.pos.z += lift * 0.8;
  out.shift = THREE.MathUtils.lerp(a.shift, b.shift, t);
  out.parallax = THREE.MathUtils.lerp(a.parallax, b.parallax, t);
  return out;
}
