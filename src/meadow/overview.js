import * as THREE from 'three';
import { curve } from './path.js';
import { heightAt } from './terrain.js';

/**
 * The zoomed-out view: a tilted bird's-eye pose that fits the whole path.
 * Wide screens see the path run left → right; tall screens see it run
 * bottom → top, so the walk always reads in the direction you'd scroll.
 */
const PITCH = THREE.MathUtils.degToRad(58);
const MARGIN = 1.18;

const box = new THREE.Box3().setFromPoints(curve.getSpacedPoints(60));
const centre = box.getCenter(new THREE.Vector3());
centre.y = heightAt(centre.x, centre.z);
const length = box.max.z - box.min.z;
const width = Math.max(30, box.max.x - box.min.x + 22);

const m4 = new THREE.Matrix4();
const up = new THREE.Vector3(0, 1, 0);
const aim = new THREE.Vector3();

export function mapPose(camera, out) {
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const tanH = tanV * camera.aspect;
  const wide = camera.aspect >= 1;
  // Whichever axis runs across the screen fits the horizontal field of view;
  // the other is foreshortened by the tilt.
  const across = wide ? length : width;
  const deep = wide ? width : length;
  // Tilted, the near end of whatever runs up the screen looms larger: give it room.
  const dist = Math.max((across * MARGIN) / 2 / tanH, (deep * (wide ? MARGIN : 1.3) * Math.sin(PITCH)) / 2 / tanV);

  const back = Math.cos(PITCH) * dist;
  // …and on tall screens aim a little short of the middle, which lifts the
  // start of the path clear of the hint at the bottom of the screen.
  aim.copy(centre);
  if (!wide) aim.z += length * 0.17;
  out.pos.copy(aim);
  out.pos.y += Math.sin(PITCH) * dist;
  if (wide) out.pos.x += back;
  else out.pos.z += back;
  out.quat.setFromRotationMatrix(m4.lookAt(out.pos, aim, up));
  return out;
}
