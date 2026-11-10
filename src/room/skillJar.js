import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { makeCanvasTexture, cssVar } from './materials.js';

/**
 * A glass display case full of skill orbs (one per entry in skills.json).
 * Orb radius follows `level`; each orb wears its Simple Icons logo.
 * Orbs are cannon-es rigid bodies — grab one, fling it, watch them pile up.
 *
 * Physics runs in the case's local space (the group is translated, never
 * rotated), so world ↔ local is just a subtraction.
 */

const SIZE = { x: 1.4, y: 0.9, z: 0.86 };
const radiusFor = (level = 3) => 0.055 + level * 0.017;

const luminance = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

function orbTexture(skill, manager) {
  const { ctx, texture, canvas } = makeCanvasTexture(512, 256);
  const color = skill.color || '#7c5cff';
  const light = luminance(color) > 0.7;
  const ink = light ? '#111111' : '#ffffff';

  const paint = (img) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // logo printed twice (front/back) on the equator of the equirect map
    [128, 384].forEach((cx) => {
      if (img) {
        ctx.drawImage(img, cx - 44, 128 - 44, 88, 88);
      } else {
        ctx.fillStyle = ink;
        ctx.font = `700 46px ${cssVar('--font-display', 'sans-serif')}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((skill.abbr || skill.name).slice(0, 3), cx, 128);
      }
    });
    texture.needsUpdate = true;
  };

  paint(null);
  if (skill.icon) {
    const loader = new THREE.ImageLoader(manager);
    loader.setCrossOrigin('anonymous');
    loader.load(
      `https://cdn.simpleicons.org/${skill.icon}/${light ? '111111' : 'ffffff'}`,
      (img) => paint(img),
      undefined,
      () => {} // keep the text fallback
    );
  }
  return texture;
}

export function createSkillJar({ skills, anchor, manager }) {
  const group = new THREE.Group();
  group.position.copy(anchor);
  const half = new CANNON.Vec3(SIZE.x / 2, SIZE.y / 2, SIZE.z / 2);

  // ---------- Glass case ----------
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(SIZE.x, SIZE.y, SIZE.z),
    new THREE.MeshPhysicalMaterial({
      color: 0xbfefff,
      transparent: true,
      opacity: 0.08,
      roughness: 0.05,
      metalness: 0,
      clearcoat: 1,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  glass.renderOrder = 2;
  group.add(glass);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(glass.geometry),
    new THREE.LineBasicMaterial({ color: 0x4ff3ff, transparent: true, opacity: 0.55 })
  );
  group.add(edges);
  // little brass name plate
  const plate = makeCanvasTexture(256, 64);
  const drawPlate = () => {
    plate.ctx.fillStyle = '#c9a25b';
    plate.ctx.fillRect(0, 0, 256, 64);
    plate.ctx.fillStyle = '#1b1407';
    plate.ctx.font = `600 26px ${cssVar('--font-mono', 'monospace')}`;
    plate.ctx.textAlign = 'center';
    plate.ctx.fillText('skills.jar', 128, 41);
    plate.texture.needsUpdate = true;
  };
  drawPlate();
  const plateMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.075),
    new THREE.MeshStandardMaterial({ map: plate.texture, metalness: 0.6, roughness: 0.35 })
  );
  plateMesh.position.set(0, -SIZE.y / 2 + 0.06, SIZE.z / 2 + 0.002);
  group.add(plateMesh);

  // ---------- Physics world ----------
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.8, 0) });
  world.allowSleep = true;
  const orbMat = new CANNON.Material('orb');
  const wallMat = new CANNON.Material('wall');
  world.addContactMaterial(new CANNON.ContactMaterial(orbMat, orbMat, { friction: 0.15, restitution: 0.45 }));
  world.addContactMaterial(new CANNON.ContactMaterial(orbMat, wallMat, { friction: 0.2, restitution: 0.55 }));

  const walls = [
    [0, -half.y, 0, -Math.PI / 2, 0, 0], // floor (normal +y)
    [0, half.y, 0, Math.PI / 2, 0, 0], // lid (normal -y)
    [-half.x, 0, 0, 0, Math.PI / 2, 0], // left (normal +x)
    [half.x, 0, 0, 0, -Math.PI / 2, 0], // right (normal -x)
    [0, 0, -half.z, 0, 0, 0], // back (normal +z)
    [0, 0, half.z, 0, Math.PI, 0], // front (normal -z)
  ];
  walls.forEach(([x, y, z, rx, ry, rz]) => {
    const body = new CANNON.Body({ mass: 0, material: wallMat, shape: new CANNON.Plane() });
    body.position.set(x, y, z);
    body.quaternion.setFromEuler(rx, ry, rz);
    world.addBody(body);
  });

  // ---------- Orbs ----------
  const flat = skills.flatMap((g) => g.skills);
  const orbs = flat.map((skill, i) => {
    const r = radiusFor(skill.level);
    const tex = orbTexture(skill, manager);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(r, 32, 20),
      new THREE.MeshStandardMaterial({
        map: tex,
        emissiveMap: tex,
        emissive: 0xffffff,
        emissiveIntensity: 0.18,
        roughness: 0.3,
        metalness: 0.1,
      })
    );
    mesh.userData = { orb: true, skill, label: skill.name, station: 'skills' };
    group.add(mesh);

    const body = new CANNON.Body({
      mass: r * 10,
      material: orbMat,
      shape: new CANNON.Sphere(r),
      linearDamping: 0.08,
      angularDamping: 0.2,
      sleepSpeedLimit: 0.05,
    });
    // drop them in from above in a loose column so they tumble into place
    body.position.set(
      (Math.random() - 0.5) * (SIZE.x - r * 2) * 0.9,
      -half.y + r + 0.05 + (i / flat.length) * (SIZE.y - r * 2 - 0.1),
      (Math.random() - 0.5) * (SIZE.z - r * 2) * 0.9
    );
    body.quaternion.setFromEuler(0, Math.random() * Math.PI * 2, 0);
    world.addBody(body);
    return { mesh, body, skill, r, pulse: 0 };
  });

  // ---------- Dragging ----------
  const plane = new THREE.Plane();
  const hit = new THREE.Vector3();
  const target = new THREE.Vector3();
  let dragging = null;

  const clampInside = (v, r) => {
    v.x = THREE.MathUtils.clamp(v.x, -half.x + r, half.x - r);
    v.y = THREE.MathUtils.clamp(v.y, -half.y + r, half.y - r);
    v.z = THREE.MathUtils.clamp(v.z, -half.z + r, half.z - r);
    return v;
  };

  return {
    group,
    redrawText: drawPlate,
    get dragging() {
      return !!dragging;
    },

    startDrag(mesh, worldPoint, camera) {
      const orb = orbs.find((o) => o.mesh === mesh);
      if (!orb) return false;
      dragging = orb;
      const n = camera.getWorldDirection(new THREE.Vector3()).negate();
      plane.setFromNormalAndCoplanarPoint(n, worldPoint);
      target.copy(worldPoint).sub(group.position);
      orb.body.wakeUp();
      return true;
    },

    drag(raycaster) {
      if (!dragging) return;
      if (raycaster.ray.intersectPlane(plane, hit)) {
        target.copy(hit).sub(group.position);
        clampInside(target, dragging.r);
      }
    },

    endDrag() {
      if (!dragging) return;
      const v = dragging.body.velocity;
      const max = 7;
      const len = v.length();
      if (len > max) v.scale(max / len, v);
      dragging = null;
    },

    // Click the case (not an orb): everything jumps.
    shake() {
      orbs.forEach((o) => {
        o.body.wakeUp();
        o.body.applyImpulse(
          new CANNON.Vec3((Math.random() - 0.5) * 1.2, 2 + Math.random() * 2, (Math.random() - 0.5) * 1.2).scale(o.body.mass)
        );
      });
    },

    // Hovering a skill chip in the HTML pops the matching orb.
    highlight(name) {
      const orb = orbs.find((o) => o.skill.name === name);
      if (!orb) return;
      orb.pulse = 1;
      orb.body.wakeUp();
      orb.body.applyImpulse(new CANNON.Vec3(0, 3.2 * orb.body.mass, 0));
    },

    step(dt) {
      if (dragging) {
        const b = dragging.body;
        b.velocity.set(
          (target.x - b.position.x) * 18,
          (target.y - b.position.y) * 18,
          (target.z - b.position.z) * 18
        );
        b.angularVelocity.scale(0.9, b.angularVelocity);
      }
      world.step(1 / 60, dt, 3);
      orbs.forEach((o) => {
        o.mesh.position.copy(o.body.position);
        o.mesh.quaternion.copy(o.body.quaternion);
        if (o.pulse > 0) o.pulse = Math.max(0, o.pulse - dt * 1.5);
        o.mesh.material.emissiveIntensity = 0.18 + o.pulse * 0.9 + (o === dragging ? 0.35 : 0);
      });
    },

    dispose() {
      orbs.forEach((o) => {
        o.mesh.geometry.dispose();
        o.mesh.material.map?.dispose();
        o.mesh.material.dispose();
      });
      glass.geometry.dispose();
      glass.material.dispose();
    },
  };
}
