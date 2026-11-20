import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Scanned assets (Poly Haven, CC0 — see src/public/CREDITS.md):
 *   sky/       photographed skies, resized from the 8k originals
 *   textures/  ground, path, wood, bark, metal (albedo + normal)
 *   models/    plants and props as meshopt-compressed GLB with WebP textures
 */
export function createAssets({ manager, anisotropy = 4 }) {
  const textures = new THREE.TextureLoader(manager);
  const gltf = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
  const models = new Map();

  return {
    /** Tiling texture; colour maps are sRGB, data maps (normals) are not. */
    texture(path, { srgb = false, repeat = 1, onLoad } = {}) {
      const t = textures.load(path, onLoad);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.setScalar(repeat);
      t.anisotropy = anisotropy;
      return t;
    },
    /** Resolves to the model's scene; a failed download resolves to null. */
    model(name) {
      if (!models.has(name)) {
        models.set(
          name,
          gltf.loadAsync(`models/${name}.glb`).then((g) => g.scene).catch(() => null)
        );
      }
      return models.get(name);
    },
  };
}

const v = new THREE.Vector3();
const n3 = new THREE.Matrix3();

/**
 * Flatten a loaded model into one plain float geometry in its own root space
 * (node transforms, mesh quantisation and UV transforms all baked in), so it
 * can be fed to the instanced scatter shader. Returns the first material too.
 */
export function bakeModel(root, { scale = 1 } = {}) {
  root.updateMatrixWorld(true);
  const parts = [];
  let material = null;
  root.traverse((o) => {
    if (!o.isMesh) return;
    material ??= o.material;
    const src = o.geometry;
    const count = src.attributes.position.count;
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    n3.getNormalMatrix(o.matrixWorld);
    const map = o.material.map;
    map?.updateMatrix();
    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(src.attributes.position, i).applyMatrix4(o.matrixWorld).multiplyScalar(scale);
      pos.set([v.x, v.y, v.z], i * 3);
      if (src.attributes.normal) {
        v.fromBufferAttribute(src.attributes.normal, i).applyMatrix3(n3).normalize();
        nor.set([v.x, v.y, v.z], i * 3);
      }
      if (src.attributes.uv) {
        v.set(src.attributes.uv.getX(i), src.attributes.uv.getY(i), 1);
        if (map) v.applyMatrix3(map.matrix);
        uv.set([v.x, v.y], i * 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(src.index ? Array.from(src.index.array) : [...Array(count).keys()]);
    parts.push(g);
  });
  const geometry = parts.length > 1 ? mergeGeometries(parts) : parts[0];
  geometry.computeBoundingBox();
  return { geometry, material };
}
