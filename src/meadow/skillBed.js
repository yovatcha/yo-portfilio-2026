import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt } from './terrain.js';

/**
 * The flower bed at the skills stop: one gerbera-like flower per skill in
 * skills.json, one clump per group. Petal colour is the skill's brand colour
 * and height is its level — the taller the flower, the more Chaiyo leans on it.
 *
 * Several skills share near-identical colours (three are plain white), so the
 * flower is identified by its hover label, never by colour alone.
 */

// Two rings of long strap petals around a unit-radius head, facing +Z.
// Vertex colours shade each petal from a deep throat to a pale tip.
function petalsGeometry() {
  const parts = [];
  const ring = (n, inner, outer, width, lift, turn, shade) => {
    for (let i = 0; i < n; i++) {
      // no two petals quite alike
      const j = Math.sin(i * 12.9898 + n) * 0.5 + 0.5;
      const len = outer * (0.88 + j * 0.14);
      const rows = [
        [inner, width * 0.5, lift, 0.45],
        [inner + (len - inner) * 0.4, width, lift * 1.6, 0.8],
        [inner + (len - inner) * 0.78, width * 0.9, lift * (0.7 + j), 1],
        [len, width * 0.22, -lift * j, 1.08],
      ];
      const pos = [];
      const col = [];
      for (let r = 0; r < rows.length - 1; r++) {
        const [r0, w0, z0, c0] = rows[r];
        const [r1, w1, z1, c1] = rows[r + 1];
        pos.push(-w0, r0, z0, w0, r0, z0, w1, r1, z1, -w0, r0, z0, w1, r1, z1, -w1, r1, z1);
        [c0, c0, c1, c0, c1, c1].forEach((c) => col.push(c * shade, c * shade, c * shade));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.rotateZ(turn + ((i + (j - 0.5) * 0.3) / n) * Math.PI * 2);
      g.computeVertexNormals();
      parts.push(g);
    }
  };
  ring(22, 0.2, 1.0, 0.07, 0.08, 0, 1);
  ring(22, 0.2, 0.86, 0.065, 0.2, Math.PI / 22, 0.86);
  return mergeGeometries(parts);
}

// Stem one unit tall (scaled per flower) with two leaves low down.
function stemGeometry() {
  const stem = new THREE.CylinderGeometry(0.0032, 0.0045, 1, 6, 1, true).translate(0, 0.5, 0);
  const leaf = (turn, y) =>
    new THREE.SphereGeometry(1, 8, 4).scale(0.022, 0.003, 0.07).rotateX(-0.9).translate(0, y, 0.05).rotateY(turn);
  return mergeGeometries([stem, leaf(0.4, 0.16), leaf(2.6, 0.24), leaf(4.6, 0.1)]);
}

const HEART = new THREE.SphereGeometry(1, 14, 8).scale(0.27, 0.27, 0.12).translate(0, 0, 0.11);
const PROXY = new THREE.SphereGeometry(1, 8, 6);

export function createSkillBed({ skills, station, reduceMotion }) {
  const centre = station.ground;
  const eye = station.stand.clone();
  eye.y += station.eye;
  // Bed-local axes: `back` points away from the walker, `side` runs across the view.
  const back = new THREE.Vector3(centre.x - eye.x, 0, centre.z - eye.z).normalize();
  const side = new THREE.Vector3(-back.z, 0, back.x);

  const flowers = [];
  skills.forEach((group, gi) => {
    const bedA = (gi - (skills.length - 1) / 2) * 0.52;
    const bedB = gi % 2 ? 0.2 : -0.14;
    group.skills.forEach((s, i) => {
      // Sunflower-seed spiral keeps the heads from overlapping.
      const r = 0.085 * Math.sqrt(i + 0.4);
      const a = i * 2.39996 + gi;
      const la = bedA + Math.cos(a) * r;
      const lb = bedB + Math.sin(a) * r;
      const x = centre.x + side.x * la + back.x * lb;
      const z = centre.z + side.z * la + back.z * lb;
      const level = s.level ?? 3;
      flowers.push({
        name: s.name,
        label: `${s.name} · ${group.group}`,
        color: s.color,
        base: new THREE.Vector3(x, heightAt(x, z), z),
        height: 0.22 + level * 0.065 + lb * 0.25,
        radius: 0.036 + level * 0.0075,
        phase: i * 1.7 + gi,
        pulse: 0,
      });
    });
  });

  const n = flowers.length;
  const petals = new THREE.InstancedMesh(petalsGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide, vertexColors: true }), n);
  const hearts = new THREE.InstancedMesh(HEART, new THREE.MeshStandardMaterial({ roughness: 0.9 }), n);
  const stems = new THREE.InstancedMesh(stemGeometry(), new THREE.MeshStandardMaterial({ color: 0x4d7a26, roughness: 0.8, side: THREE.DoubleSide }), n);
  [petals, hearts, stems].forEach((m) => {
    m.frustumCulled = false;
    m.castShadow = true;
  });

  const c = new THREE.Color();
  const hsl = {};
  flowers.forEach((f, i) => {
    petals.setColorAt(i, c.set(f.color).lerp(new THREE.Color(0xf2ead8), 0.22));
    // A yellow or orange flower gets a dark heart; everything else a golden one.
    c.getHSL(hsl);
    const warm = hsl.h > 0.06 && hsl.h < 0.2 && hsl.s > 0.5;
    hearts.setColorAt(i, c.set(warm ? 0x3a2412 : 0xd8a21a));
  });

  // Invisible pick targets, so picking.js needs no per-instance support.
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  const proxies = flowers.map((f) => {
    const p = new THREE.Mesh(PROXY, hidden);
    p.scale.setScalar(f.radius * 1.35);
    p.userData = { station: 'skills', action: 'skill', label: f.label, skill: f.name };
    return p;
  });

  const group = new THREE.Group();
  group.add(stems, hearts, petals, ...proxies);

  // ---- per-frame instance matrices ----
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const nod = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const face = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const xAxis = new THREE.Vector3(1, 0, 0);
  const idQ = new THREE.Quaternion();

  function layout(t, wind) {
    flowers.forEach((f, i) => {
      const sway = reduceMotion ? 0 : Math.sin(t * 1.3 + f.phase) * 0.012 * wind;
      pos.set(f.base.x + sway, f.base.y + f.height, f.base.z + sway * 0.4);
      // Heads turn up and towards the walker, each a little differently.
      face.set(eye.x - pos.x, 0, eye.z - pos.z).normalize().multiplyScalar(0.75);
      face.x += Math.sin(f.phase * 3.1) * 0.25;
      face.y = 0.75 + Math.cos(f.phase * 2.3) * 0.2;
      q.setFromUnitVectors(zAxis, face.normalize());
      if (f.pulse > 0.001) q.multiply(nod.setFromAxisAngle(xAxis, Math.sin(t * 13) * 0.3 * f.pulse));
      const r = f.radius * (1 + 0.35 * f.pulse);
      m4.compose(pos, q, scl.setScalar(r));
      petals.setMatrixAt(i, m4);
      hearts.setMatrixAt(i, m4);
      stems.setMatrixAt(i, m4.compose(f.base, idQ, scl.set(1, f.height, 1)));
      proxies[i].position.copy(pos);
    });
    stems.instanceMatrix.needsUpdate = true;
    hearts.instanceMatrix.needsUpdate = true;
    petals.instanceMatrix.needsUpdate = true;
  }
  layout(0, 1);

  return {
    group,
    proxies,
    /** Make one skill's flower nod and swell. */
    highlight(name) {
      const f = flowers.find((x) => x.name === name);
      if (f) f.pulse = 1;
    },
    update(t, dt, wind) {
      let active = !reduceMotion;
      flowers.forEach((f) => {
        if (f.pulse > 0) {
          f.pulse = Math.max(0, f.pulse - dt * 1.4);
          active = true;
        }
      });
      if (active) layout(t, wind);
    },
  };
}
