import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { blossom } from './materials.js';
import { rng } from './util.js';

/**
 * Trees: one scanned broadleaf (Poly Haven `island_tree_02`), simplified for
 * the web at two weights — ~8% of its triangles for the blossom trees you
 * walk right up to at the projects stop, ~1% for the ones instanced along
 * the ridges either side of the valley.
 */
const NEAR = 'island_tree_02';
const FAR = 'island_tree_02_far';
const isLeaf = (m) => m.alphaTest > 0 || m.transparent || /lea/i.test(m.name);

// The model normalised: base at the origin, 1 unit tall.
function prepare(scene) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const fit = new THREE.Matrix4()
    .makeScale(1 / size.y, 1 / size.y, 1 / size.y)
    .multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2));
  const parts = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.material.side = isLeaf(o.material) ? THREE.DoubleSide : THREE.FrontSide;
    // Simplifying thins the leaf cards; a low cut-off lets each one fill out again.
    if (isLeaf(o.material)) o.material.alphaTest = 0.14;
    parts.push({ geometry: o.geometry, material: o.material, matrix: fit.clone().multiply(o.matrixWorld) });
  });
  return parts;
}

const prepared = new Map();
function partsOf(assets, name) {
  if (!prepared.has(name)) prepared.set(name, assets.model(name).then((scene) => (scene ? prepare(scene) : null)));
  return prepared.get(name);
}

/**
 * One free-standing tree, `height` metres tall. `tint` turns its leaves into
 * blossom. Resolves to a Group (empty if the model failed to load).
 */
export function plantTree(assets, { height = 4, tint = null, turn = 0 } = {}) {
  const group = new THREE.Group();
  partsOf(assets, NEAR).then((parts) => {
    if (!parts) return;
    parts.forEach((p) => {
      const mesh = new THREE.Mesh(p.geometry, tint && isLeaf(p.material) ? blossom(p.material, tint) : p.material.clone());
      mesh.applyMatrix4(p.matrix);
      mesh.castShadow = true;
      mesh.receiveShadow = !isLeaf(p.material);
      group.add(mesh);
    });
    group.scale.setScalar(height);
    group.rotation.y = turn;
    group.userData.onReady?.(group);
  });
  return group;
}

// Clumps on the ridges either side of the valley, and a few on the skyline.
const CLUMPS = [
  [-27, -4], [-40, -20], [31, -18], [44, -40], [-33, -52], [-46, -74],
  [29, -70], [38, -98], [-28, -104], [-40, -132], [30, -138], [-22, -172],
  [18, -182], [52, -160], [-58, -40], [60, -76], [-64, -150], [70, -128],
  [-80, -96], [84, -30], [-30, 22], [36, 18],
];

export function createTrees({ assets, tier }) {
  const group = new THREE.Group();
  const perClump = { high: 2, mid: 1, low: 1 }[tier];
  const rand = rng(77);
  const spots = [];
  CLUMPS.slice(0, tier === 'low' ? 12 : CLUMPS.length).forEach(([cx, cz]) => {
    for (let i = 0; i < perClump; i++) {
      const x = cx + (rand() - 0.5) * 12;
      const z = cz + (rand() - 0.5) * 12;
      spots.push({ x, z, height: 7 + rand() * 5, turn: rand() * Math.PI * 2 });
    }
  });

  partsOf(assets, FAR).then((parts) => {
    if (!parts) return;
    const m4 = new THREE.Matrix4();
    const place = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    parts.forEach((part) => {
      const inst = new THREE.InstancedMesh(part.geometry, part.material, spots.length);
      spots.forEach((t, i) => {
        place.compose(p.set(t.x, heightAt(t.x, t.z) - 0.3, t.z), q.setFromAxisAngle(up, t.turn), s.setScalar(t.height));
        inst.setMatrixAt(i, m4.multiplyMatrices(place, part.matrix));
      });
      inst.frustumCulled = false;
      group.add(inst);
    });
  });

  // The hills at the end of the valley; the haze turns them blue.
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x2f4a22, roughness: 1 });
  const ball = new THREE.SphereGeometry(1, 24, 12);
  [
    [60, -600, 340, 30, 130],
    [-240, -520, 280, 24, 120],
    [300, -480, 260, 22, 110],
    [-380, -310, 190, 26, 170],
    [390, -250, 180, 22, 170],
  ].forEach(([x, z, sx, sy, sz]) => {
    const hill = new THREE.Mesh(ball, hillMat);
    hill.position.set(x, -8, z);
    hill.scale.set(sx, sy, sz);
    group.add(hill);
  });

  return group;
}
