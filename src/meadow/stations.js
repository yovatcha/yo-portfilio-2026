import * as THREE from 'three';
import { PATH_LENGTH, pathPoint, pathRight } from './path.js';

/**
 * Stops along the path — one per page section, in DOM order.
 *
 *  u       where the walker stands (fraction of the path)
 *  eye     eye height above the ground
 *  ahead / side   where the stop's landmark stands, in metres from the walker
 *                 (side: + right of the path, − left)
 *  lift    how high on the landmark the camera looks
 *  shift   slides the framed landmark sideways (fraction of screen width) so
 *          it sits beside the docked HTML sheet instead of underneath it:
 *          negative → landmark left (sheet right), positive → the reverse.
 *          Implemented with camera.setViewOffset, so perspective stays natural.
 *  day     time of day at this stop, 0 = noon … 1 = last light (see env.js)
 */
export const STATIONS = [
  // The hero frames the reference picture: low in the grass, looking up the valley.
  { id: 'hero', u: 0.03, eye: 0.45, ahead: 40, side: 0, lift: 4.2, shift: 0, parallax: 1, day: 0 },
  { id: 'about', u: 0.17, eye: 1.5, ahead: 7, side: -3, lift: 0.8, shift: -0.2, parallax: 0.4, day: 0.08 },
  { id: 'projects', u: 0.32, eye: 1.55, ahead: 10, side: 4.4, lift: 2.0, shift: 0.22, parallax: 0.4, day: 0.3 },
  // the bed is small and close: stand over it
  { id: 'skills', u: 0.47, eye: 1.2, ahead: 2.7, side: -1.6, lift: 0.3, shift: -0.2, parallax: 0.25, day: 0.5 },
  { id: 'music', u: 0.62, eye: 1.3, ahead: 4.6, side: 2.2, lift: 0.55, shift: 0.2, parallax: 0.4, day: 0.68 },
  { id: 'faq', u: 0.77, eye: 1.5, ahead: 6, side: -2.6, lift: 1.4, shift: -0.2, parallax: 0.45, day: 0.86 },
  { id: 'contact', u: 0.91, eye: 1.45, ahead: 5.2, side: 2.1, lift: 1.0, shift: 0.2, parallax: 0.4, day: 1 },
].map((s) => {
  const right = pathRight(s.u, new THREE.Vector3());
  // `ground` is where the landmark stands; `focus` is where the camera looks.
  const ground = pathPoint(s.u + s.ahead / PATH_LENGTH, new THREE.Vector3()).addScaledVector(right, s.side);
  const stand = pathPoint(s.u, new THREE.Vector3());
  const focus = ground.clone();
  focus.y = (s.side === 0 ? stand.y + s.eye : ground.y) + s.lift;
  return { ...s, stand, ground, focus };
});

export const stationIndex = (id) => STATIONS.findIndex((s) => s.id === id);

const smooth = (t) => t * t * (3 - 2 * t);

// While a section fills the viewport the walker keeps strolling this far
// towards the next stop, so long sections (About) never feel frozen.
const HOLD = 0.12;

/**
 * Maps scroll position → a float station index (e.g. 2.4 = 40% of the way
 * from projects to skills). Each section "holds" its stop while it fills the
 * viewport (drifting forward by HOLD); the real walking happens around the
 * section boundaries.
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
        if (y < b - band) {
          const start = i === 0 ? vh * 0.5 : (bounds[i]?.top ?? 0) + band;
          const span = b - band - start;
          return i + HOLD * (span > 0 ? Math.max(0, Math.min(1, (y - start) / span)) : 1);
        }
        if (y < b + band) return i + HOLD + (1 - HOLD) * smooth((y - (b - band)) / (band * 2));
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

const ahead = new THREE.Vector3();

/**
 * Walker pose for a float station index. The position is evaluated on the
 * spline itself — easing happens on `f`, never on the position, so the camera
 * can't cut a corner through a hillside.
 */
export function poseAt(f, out) {
  const last = STATIONS.length - 1;
  const i = Math.max(0, Math.min(last, Math.floor(f)));
  const j = Math.min(last, i + 1);
  const t = Math.max(0, Math.min(1, f - i));
  const a = STATIONS[i];
  const b = STATIONS[j];
  const u = THREE.MathUtils.lerp(a.u, b.u, t);
  // Keep looking at this stop's landmark during the hold; turn once walking.
  const k = smooth(Math.max(0, (t - HOLD) / (1 - HOLD)));

  out.eye = THREE.MathUtils.lerp(a.eye, b.eye, k);
  pathPoint(u, out.pos);
  out.pos.y += out.eye;

  out.target.lerpVectors(a.focus, b.focus, k);
  // Mid-walk, look down the path rather than sideways at the next landmark.
  pathPoint(u + 16 / PATH_LENGTH, ahead);
  ahead.y += 1.3;
  out.target.lerp(ahead, Math.sin(k * Math.PI) * 0.7);

  out.shift = THREE.MathUtils.lerp(a.shift, b.shift, k);
  out.parallax = THREE.MathUtils.lerp(a.parallax, b.parallax, k);
  out.day = THREE.MathUtils.lerp(a.day, b.day, t);
  out.u = u;
  return out;
}
