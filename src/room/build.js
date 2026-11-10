import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PALETTE, clay, coated, pbr, glow, makeCanvasTexture } from './materials.js';
import { createWindowView } from './windowView.js';
import {
  createMonitorScreen,
  createPhoneScreen,
  createNeonSign,
  createPoster,
} from './screens.js';

/**
 * Procedural "2 a.m. Bangkok condo" diorama.
 *
 * Built from primitives so there is nothing to download. Every interactive
 * object is a THREE.Group tagged with `userData.station` (the section it
 * belongs to) and `userData.action` (what clicking it does once you're there).
 * Swapping in a Blender .glb later only needs the same group names/tags.
 *
 * Room axes: floor at y=0, back wall at z=-3.5, window wall at x=-4.5.
 */

const rbox = (w, h, d, mat, r = 0.02) =>
  new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), mat);

const cyl = (rt, rb, h, mat, seg = 32) =>
  new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);

const at = (obj, x, y, z) => {
  obj.position.set(x, y, z);
  return obj;
};

// Interactive groups carry their own material copies so hover glow stays local.
function tag(group, station, action, label, labelPos) {
  group.userData = { station, action, label, labelPos: new THREE.Vector3(...labelPos) };
  group.traverse((o) => {
    if (o.isMesh && o.material?.isMeshStandardMaterial) o.material = o.material.clone();
  });
  return group;
}

export function buildRoom({ projects, portrait, reduceMotion }) {
  const root = new THREE.Group();
  const groups = {};

  // Scanned PBR surfaces (see src/public/textures/CREDITS.md).
  const M = {
    wall: pbr('plaster', { repeat: [4, 2], color: 0x77729a }),
    wallDark: coated(PALETTE.wallDark, { roughness: 0.5, clearcoat: 0.2 }),
    floor: pbr('floor', { repeat: [4, 3], color: 0xd8ccc4 }),
    wood: pbr('walnut', { repeat: [2, 1] }),
    woodLight: pbr('oak', { repeat: [1.5, 1] }),
    metal: pbr('metal', { metalness: 1, color: 0xb8b8c0 }),
    black: coated(0x16161c, { roughness: 0.35, clearcoat: 0.4 }),
    cream: coated(PALETTE.cream, { roughness: 0.55, clearcoat: 0.2 }),
    fabric: pbr('fabric', { repeat: [1, 1], color: 0x4a4a58 }),
    pot: pbr('pot', { color: 0xd08a66 }),
  };

  // ---------- Shell: floor slab, back wall, window wall ----------
  root.add(at(rbox(9, 0.24, 7, M.floor, 0.04), 0, -0.12, 0));
  root.add(at(rbox(9, 4.2, 0.2, M.wall, 0.03), 0, 2.1, -3.6));
  // skirting board
  root.add(at(rbox(8.8, 0.12, 0.04, M.wallDark), 0.1, 0.06, -3.48));

  // window wall in four pieces around the opening (z -2.3..-0.1, y 1.3..2.9)
  const wallX = -4.6;
  root.add(at(rbox(0.2, 1.3, 5.5, M.wall), wallX, 0.65, -0.75));
  root.add(at(rbox(0.2, 1.3, 5.5, M.wall), wallX, 3.55, -0.75));
  root.add(at(rbox(0.2, 1.6, 1.2, M.wall), wallX, 2.1, -2.9));
  root.add(at(rbox(0.2, 1.6, 2.1, M.wall), wallX, 2.1, 0.95));

  // ---------- Window (FAQ station) ----------
  const windowGroup = new THREE.Group();
  const view = createWindowView({ reduceMotion });
  view.mesh.rotation.y = Math.PI / 2;
  // Tucked right behind the opening and smaller than the wall, so no edge
  // of the view ever peeks out around or over the wall.
  windowGroup.add(at(view.mesh, -4.95, 2.1, -1.2));
  const frameMat = pbr('metal', { metalness: 1, color: 0x5a5a66 });
  windowGroup.add(at(rbox(0.16, 0.08, 2.3, frameMat), -4.48, 2.92, -1.2));
  windowGroup.add(at(rbox(0.3, 0.08, 2.4, M.woodLight), -4.4, 1.27, -1.2)); // sill
  windowGroup.add(at(rbox(0.16, 1.6, 0.06, frameMat), -4.48, 2.1, -2.27));
  windowGroup.add(at(rbox(0.16, 1.6, 0.06, frameMat), -4.48, 2.1, -0.13));
  windowGroup.add(at(rbox(0.1, 1.6, 0.04, frameMat), -4.5, 2.1, -1.2));
  windowGroup.add(at(rbox(0.1, 0.04, 2.2, frameMat), -4.5, 2.25, -1.2));
  // little cactus on the sill
  const cactus = new THREE.Group();
  cactus.add(at(cyl(0.07, 0.055, 0.1, M.pot), 0, 0.05, 0));
  cactus.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.08, 4, 12), clay(PALETTE.plant)), 0, 0.15, 0));
  windowGroup.add(at(cactus, -4.4, 1.31, -0.55));
  tag(windowGroup, 'faq', 'rain', 'window · faq', [-4.3, 3.15, -1.2]);
  root.add(windowGroup);
  groups.window = windowGroup;

  // ---------- Desk ----------
  const desk = new THREE.Group();
  desk.add(at(rbox(2.8, 0.07, 1.2, M.wood, 0.03), 0, 0.745, 0));
  [
    [-1.32, -0.52],
    [1.32, -0.52],
    [-1.32, 0.52],
    [1.32, 0.52],
  ].forEach(([x, z]) => desk.add(at(rbox(0.06, 0.71, 0.06, M.metal), x, 0.355, z)));
  desk.add(at(rbox(0.5, 0.5, 1.0, M.woodLight), 1.0, 0.45, 0)); // drawer unit
  root.add(at(desk, 0.4, 0, -2.75));

  // keyboard + mouse + mug
  root.add(at(rbox(0.82, 0.025, 0.26, M.black, 0.01), 0.4, 0.795, -2.48));
  root.add(at(rbox(0.07, 0.03, 0.11, M.black, 0.03), 1.0, 0.795, -2.45));
  const mug = new THREE.Group();
  const ceramic = coated(PALETTE.neon, { roughness: 0.3, clearcoat: 1 });
  mug.add(at(cyl(0.05, 0.045, 0.11, ceramic), 0, 0.055, 0));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 16), ceramic);
  handle.rotation.y = Math.PI / 2;
  mug.add(at(handle, 0.055, 0.06, 0));
  root.add(at(mug, -0.15, 0.78, -3.05));

  // ---------- Monitor (Projects station) ----------
  const monitor = new THREE.Group();
  monitor.add(at(rbox(0.32, 0.02, 0.22, M.metal, 0.01), 0, 0.79, 0.05));
  monitor.add(at(rbox(0.05, 0.42, 0.04, M.metal, 0.01), 0, 1.0, 0.0));
  monitor.add(at(rbox(1.26, 0.75, 0.05, M.black, 0.02), 0, 1.33, 0.03));
  const monitorScreen = createMonitorScreen(projects);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.18, 0.665),
    new THREE.MeshBasicMaterial({ map: monitorScreen.texture, toneMapped: false })
  );
  screen.material.color.setScalar(0.95);
  monitor.add(at(screen, 0, 1.335, 0.057));
  tag(monitor, 'projects', 'next-project', 'monitor · projects', [0, 1.85, 0]);
  root.add(at(monitor, 0.4, 0, -3.03));
  groups.monitor = monitor;

  // ---------- Photo frame (About station) ----------
  const photo = new THREE.Group();
  const frameW = 0.5;
  const frameH = frameW / 1.5;
  const photoInner = new THREE.Group(); // spun on click
  photoInner.add(rbox(frameW + 0.04, frameH + 0.04, 0.025, M.cream, 0.01));
  const pic = new THREE.Mesh(
    new THREE.PlaneGeometry(frameW - 0.02, frameH - 0.02),
    new THREE.MeshStandardMaterial({ map: portrait, roughness: 0.6, color: 0xffffff })
  );
  // photo backdrop so the transparent cut-out portrait sits on a colour
  const picBack = new THREE.Mesh(
    new THREE.PlaneGeometry(frameW - 0.02, frameH - 0.02),
    new THREE.MeshStandardMaterial({ color: 0x2a1840, roughness: 0.9 })
  );
  photoInner.add(at(picBack, 0, 0, 0.0135));
  pic.material.transparent = true;
  photoInner.add(at(pic, 0, 0, 0.014));
  photo.add(at(photoInner, 0, frameH / 2 + 0.03, 0));
  const easel = rbox(0.03, frameH * 0.9, 0.02, M.cream, 0.005);
  easel.rotation.x = 0.35;
  photo.add(at(easel, 0, frameH * 0.42, -0.06));
  photo.rotation.y = 0.35;
  photo.userData.inner = photoInner;
  tag(photo, 'about', 'spin-photo', 'photo · about', [0, 0.55, 0]);
  root.add(at(photo, -0.6, 0.78, -2.72));
  groups.photo = photo;

  // ---------- Phone (Contact station) ----------
  const phone = new THREE.Group();
  phone.add(rbox(0.17, 0.014, 0.34, M.black, 0.02));
  const phoneScreen = createPhoneScreen();
  const phoneFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.155, 0.31),
    new THREE.MeshBasicMaterial({ map: phoneScreen.texture, toneMapped: false })
  );
  phoneFace.rotation.x = -Math.PI / 2;
  phoneFace.material.color.setScalar(0.95);
  phone.add(at(phoneFace, 0, 0.0075, 0));
  phone.rotation.y = -0.35;
  tag(phone, 'contact', 'copy-email', 'phone · contact', [0, 0.3, 0]);
  root.add(at(phone, 1.5, 0.787, -2.45));
  groups.phone = phone;

  // ---------- Desk lamp ----------
  const lamp = new THREE.Group();
  lamp.add(at(cyl(0.11, 0.12, 0.03, M.black), 0, 0.015, 0));
  const arm1 = rbox(0.025, 0.55, 0.025, M.black, 0.01);
  arm1.rotation.z = -0.25;
  lamp.add(at(arm1, 0.065, 0.28, 0));
  const arm2 = rbox(0.025, 0.45, 0.025, M.black, 0.01);
  arm2.rotation.z = 1.0;
  lamp.add(at(arm2, 0.3, 0.6, 0));
  const shade = cyl(0.04, 0.12, 0.16, M.black, 24);
  shade.rotation.z = 0.5;
  lamp.add(at(shade, 0.5, 0.66, 0));
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), glow(PALETTE.amber, 1.4));
  lamp.add(at(bulb, 0.53, 0.6, 0));
  root.add(at(lamp, -1.05, 0.78, -3.1));

  // ---------- Chair ----------
  const chair = new THREE.Group();
  chair.add(at(rbox(0.6, 0.08, 0.55, M.fabric, 0.04), 0, 0.5, 0));
  chair.add(at(rbox(0.56, 0.7, 0.07, M.fabric, 0.04), 0, 0.9, 0.28));
  chair.add(at(cyl(0.03, 0.03, 0.42, M.metal), 0, 0.25, 0));
  for (let i = 0; i < 5; i++) {
    const leg = rbox(0.35, 0.03, 0.05, M.metal, 0.01);
    leg.rotation.y = (i / 5) * Math.PI * 2;
    leg.position.set(Math.cos(-leg.rotation.y) * 0.16, 0.04, Math.sin(-leg.rotation.y) * 0.16);
    chair.add(leg);
  }
  chair.rotation.y = 0.25;
  root.add(at(chair, 0.25, 0, -1.65));

  // rug
  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(1.5, 48),
    pbr('fabric', { repeat: [3, 3], color: 0xb0608e, normalScale: 1.5 })
  );
  rug.rotation.x = -Math.PI / 2;
  root.add(at(rug, 0.2, 0.004, -1.1));
  const rugRing = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.3, 64), clay(0xff3d8b, { roughness: 1 }));
  rugRing.rotation.x = -Math.PI / 2;
  root.add(at(rugRing, 0.2, 0.006, -1.1));

  // ---------- Record cabinet, turntable + speakers (Music station) ----------
  root.add(at(rbox(1.8, 0.62, 0.8, M.woodLight, 0.03), -2.9, 0.31, -3.0));
  // record sleeves peeking out of the cabinet
  const sleeveColors = [0xff3d8b, 0x4ff3ff, 0xffb45e, 0xe9e2d4, 0x7c5cff, 0x2fe6a8];
  sleeveColors.forEach((c, i) => {
    const s = rbox(0.015, 0.32, 0.32, clay(c), 0.004);
    s.rotation.z = (i % 2 ? 1 : -1) * 0.04;
    root.add(at(s, -3.6 + i * 0.05, 0.3, -2.62));
  });

  const music = new THREE.Group();
  music.add(at(rbox(0.62, 0.08, 0.5, M.black, 0.02), 0, 0.04, 0));
  music.add(at(cyl(0.21, 0.21, 0.02, M.metal, 48), -0.06, 0.09, 0));
  const vinyl = new THREE.Group();
  vinyl.add(cyl(0.2, 0.2, 0.008, coated(0x0a0a0d, { roughness: 0.25, clearcoat: 1 }), 64));
  const labelTex = makeCanvasTexture(256, 256);
  labelTex.ctx.fillStyle = '#ff3d8b';
  labelTex.ctx.beginPath();
  labelTex.ctx.arc(128, 128, 128, 0, Math.PI * 2);
  labelTex.ctx.fill();
  labelTex.ctx.fillStyle = '#111';
  labelTex.ctx.fillRect(40, 120, 176, 16); // stripe so the spin reads
  labelTex.texture.needsUpdate = true;
  const label = new THREE.Mesh(
    new THREE.CircleGeometry(0.07, 32),
    new THREE.MeshStandardMaterial({ map: labelTex.texture, roughness: 0.6 })
  );
  label.rotation.x = -Math.PI / 2;
  vinyl.add(at(label, 0, 0.0045, 0));
  // grooves
  for (let r = 0.09; r < 0.195; r += 0.018) {
    const g = new THREE.Mesh(
      new THREE.RingGeometry(r, r + 0.002, 64),
      new THREE.MeshBasicMaterial({ color: 0x2a2a33 })
    );
    g.rotation.x = -Math.PI / 2;
    vinyl.add(at(g, 0, 0.0045, 0));
  }
  music.add(at(vinyl, -0.06, 0.105, 0));
  const tonearm = new THREE.Group();
  tonearm.add(at(cyl(0.025, 0.025, 0.05, M.metal), 0, 0.025, 0));
  const armRod = rbox(0.012, 0.012, 0.3, M.metal, 0.004);
  tonearm.add(at(armRod, 0, 0.055, 0.14));
  tonearm.add(at(rbox(0.03, 0.02, 0.05, M.black, 0.005), 0, 0.05, 0.29));
  tonearm.rotation.y = 0.5;
  music.add(at(tonearm, 0.22, 0.08, -0.18));

  const cones = [];
  const leds = [];
  [-0.65, 0.65].forEach((x) => {
    const spk = new THREE.Group();
    spk.add(at(rbox(0.3, 0.46, 0.3, M.black, 0.03), 0, 0.23, 0));
    const woofer = cyl(0.1, 0.1, 0.02, coated(0x22222a, { roughness: 0.55, clearcoat: 0.3 }), 32);
    woofer.rotation.x = Math.PI / 2;
    spk.add(at(woofer, 0, 0.17, 0.151));
    const tweeter = cyl(0.035, 0.035, 0.02, clay(0x22222a), 24);
    tweeter.rotation.x = Math.PI / 2;
    spk.add(at(tweeter, 0, 0.36, 0.151));
    // little status LED that lights while playing
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), glow(PALETTE.cyan, 0.4));
    spk.add(at(led, 0.11, 0.05, 0.152));
    music.add(at(spk, x, 0, 0));
    cones.push(woofer, tweeter);
    leds.push(led);
  });
  tag(music, 'music', 'toggle-music', 'turntable · music', [0, 0.75, 0]);
  root.add(at(music, -2.9, 0.62, -3.05));
  groups.music = music;

  // wall shelf with books above the cabinet
  root.add(at(rbox(1.6, 0.04, 0.26, M.wood), -2.9, 1.85, -3.37));
  let bx = -3.6;
  [0x4ff3ff, 0xe9e2d4, 0xff3d8b, 0x2a2a38, 0xffb45e, 0x3b2b24, 0x7c5cff, 0xe9e2d4].forEach((c, i) => {
    const h = 0.22 + ((i * 37) % 9) / 60;
    const w = 0.05 + ((i * 13) % 4) / 100;
    root.add(at(rbox(w, h, 0.18, clay(c), 0.005), bx, 1.87 + h / 2, -3.37));
    bx += w + 0.012;
  });
  const leaning = rbox(0.06, 0.24, 0.18, clay(0x2fe6a8), 0.005);
  leaning.rotation.z = -0.35;
  root.add(at(leaning, bx + 0.06, 1.98, -3.37));

  // poster
  const poster = createPoster();
  const posterMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.8),
    new THREE.MeshStandardMaterial({ map: poster.texture, roughness: 0.9 })
  );
  root.add(at(posterMesh, -2.4, 2.85, -3.49));

  // ---------- Neon sign (hero) ----------
  const sign = createNeonSign();
  const signMat = new THREE.MeshBasicMaterial({
    map: sign.texture,
    transparent: true,
    toneMapped: false,
    depthWrite: false,
  });
  signMat.color.setScalar(1.25);
  const signGroup = new THREE.Group();
  signGroup.add(new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.78), signMat));
  // acrylic backing board
  const backing = rbox(2.05, 0.82, 0.02, new THREE.MeshStandardMaterial({
    color: 0xffffff, transparent: true, opacity: 0.05, roughness: 0.1,
  }), 0.04);
  signGroup.add(at(backing, 0, 0, -0.015));
  tag(signGroup, 'hero', 'flicker', 'neon · hello', [0, 0.55, 0]);
  root.add(at(signGroup, 0.4, 2.65, -3.47));
  groups.sign = signGroup;

  // ---------- Skill jar cabinet (the jar itself lives in skillJar.js) ----------
  root.add(at(rbox(1.7, 0.55, 1.0, M.woodLight, 0.03), 3.1, 0.275, -2.95));
  const jarAnchor = new THREE.Vector3(3.1, 0.55 + 0.47, -2.95);

  // ---------- Plant ----------
  const plant = new THREE.Group();
  plant.add(at(cyl(0.22, 0.17, 0.42, M.pot), 0, 0.21, 0));
  for (let i = 0; i < 9; i++) {
    const leafMat = coated(new THREE.Color(PALETTE.plant).offsetHSL((i % 3) * 0.02, 0, (i % 4) * 0.03), {
      roughness: 0.45,
      clearcoat: 0.3,
      side: THREE.DoubleSide,
    });
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), leafMat);
    leaf.scale.set(0.45, 1.6, 0.18);
    const a = (i / 9) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.12, 0.62 + (i % 3) * 0.08, Math.sin(a) * 0.12);
    leaf.rotation.set(Math.sin(a) * 0.5, -a, Math.cos(a) * 0.5);
    plant.add(leaf);
  }
  root.add(at(plant, 4.0, 0, -1.2));

  // ---------- Dust motes drifting in the lamp light ----------
  const dustCount = 260;
  const dustPos = new Float32Array(dustCount * 3);
  const seeds = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 8;
    dustPos[i * 3 + 1] = Math.random() * 3.8;
    dustPos[i * 3 + 2] = -3.3 + Math.random() * 5;
    seeds[i] = Math.random() * 100;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: window.devicePixelRatio } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uScale;
      attribute float aSeed;
      varying float vA;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.15 + aSeed) * 0.25;
        p.y += sin(uTime * 0.1 + aSeed * 2.0) * 0.2;
        p.z += cos(uTime * 0.12 + aSeed) * 0.25;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (4.0 + fract(aSeed) * 6.0) * uScale / -mv.z;
        vA = 0.25 + 0.35 * sin(uTime + aSeed);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA;
        gl_FragColor = vec4(1.0, 0.85, 0.65, a);
      }
    `,
  });
  root.add(new THREE.Points(dustGeo, dustMat));

  // ---------- Lights ----------
  const lights = {
    hemi: new THREE.HemisphereLight(0x9aa0e0, 0x3a2a2a, 1.1),
    ambient: new THREE.AmbientLight(0xffe8d6, 0.2),
    // soft warm key from the viewer's side so furniture reads clearly
    key: new THREE.DirectionalLight(0xffd9b8, 1.1),
    lamp: new THREE.SpotLight(PALETTE.amber, 9, 6, 0.95, 0.75, 1.4),
    monitor: new THREE.PointLight(PALETTE.cyan, 1.2, 3, 1.8),
    neon: new THREE.PointLight(PALETTE.neon, 2.5, 5, 1.6),
    window: new THREE.PointLight(0x9aa6ff, 3, 6, 1.4),
    turntable: new THREE.PointLight(PALETTE.amber, 1.6, 3, 1.6),
  };
  lights.key.position.set(5, 6, 6);
  lights.lamp.position.set(-0.5, 1.4, -3.1);
  lights.lamp.target.position.set(-0.2, 0.78, -2.5);
  lights.monitor.position.set(0.4, 1.3, -2.5);
  lights.neon.position.set(0.4, 2.6, -3.0);
  lights.window.position.set(-3.8, 2.2, -1.2);
  lights.turntable.position.set(-2.9, 1.5, -2.6);
  Object.values(lights).forEach((l) => root.add(l));
  root.add(lights.lamp.target);

  return {
    root,
    groups,
    jarAnchor,
    lights,
    monitorScreen,
    phoneScreen,
    sign,
    signMat,
    // Redraw canvases once web fonts have loaded.
    redrawText() {
      monitorScreen.redraw();
      phoneScreen.redraw();
      sign.redraw();
      poster.redraw();
    },
    parts: { vinyl, tonearm, cones, leds, photoInner },
    update(t) {
      view.update(t);
      dustMat.uniforms.uTime.value = t;
    },
    setRain(on) {
      view.mesh.material.uniforms.uRain.value = on ? 1 : 0;
    },
    get rain() {
      return view.mesh.material.uniforms.uRain.value > 0.5;
    },
  };
}
