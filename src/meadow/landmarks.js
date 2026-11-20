import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createMaterials, PALETTE } from './materials.js';
import { plantTree } from './trees.js';
import { STATIONS, stationIndex } from './stations.js';
import { PATH_LENGTH, pathForward } from './path.js';
import { heightAt } from './terrain.js';
import { makeCanvasTexture, cssVar } from './util.js';

/**
 * The things beside the path. Each interactive group is tagged with
 * `userData = { station, action, label }`: clicking it walks to its section,
 * clicking again once you've arrived runs the action.
 *
 * The bench and the radio are scanned models; the signpost, mailbox, stump
 * and name stakes have no scan, so they are built from simple bevelled shapes
 * in scanned wood, bark and painted metal.
 */
const CYL = new THREE.CylinderGeometry(1, 1, 1, 20);
const BALL = new THREE.SphereGeometry(1, 16, 12);
const PLANE = new THREE.PlaneGeometry(1, 1);

export function createLandmarks({ assets, projects, tier }) {
  const mats = createMaterials({ assets, tier });
  const root = new THREE.Group();
  const interactive = [];
  const pickTargets = [];
  const texts = [];
  const hidden = new THREE.MeshBasicMaterial({ visible: false });

  const add = (geo, material, [sx, sy, sz], [x, y, z], parent) => {
    const m = new THREE.Mesh(geo, material);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  // A box with softened edges, at real size (no scaling, so the bevel stays even).
  const box = (material, [w, h, d], at, parent, bevel = 0.008) =>
    add(new RoundedBoxGeometry(w, h, d, 2, Math.min(bevel, w / 2.1, h / 2.1, d / 2.1)), material, [1, 1, 1], at, parent);

  // A group standing at `ground`, with +Z turned towards the walker.
  // `reach` is the invisible box the pointer actually hits ([w, h, d], standing
  // on the ground): raycasting the scanned meshes themselves — a tree is a few
  // hundred thousand triangles — would cost more than drawing them.
  const place = (id, action, label, reach, ground = null) => {
    const s = STATIONS[stationIndex(id)];
    const g = new THREE.Group();
    const at = ground ?? s.ground;
    g.position.set(at.x, heightAt(at.x, at.z), at.z);
    g.lookAt(s.stand.x, g.position.y, s.stand.z);
    g.userData = { station: id, action, label, pulse: 0, glow: 0, mats: [] };
    const pick = new THREE.Mesh(new THREE.BoxGeometry(...reach).translate(0, reach[1] / 2, 0), hidden);
    g.add(pick);
    pickTargets.push(pick);
    root.add(g);
    interactive.push(g);
    return g;
  };

  // Drop a scanned model into a group: base on the ground, `size` along `axis`.
  const model = (name, parent, { size, axis = 'x', at = [0, 0, 0], turn = 0 }) =>
    assets.model(name).then((scene) => {
      if (!scene) return null;
      const obj = scene.clone(true);
      const b = new THREE.Box3().setFromObject(obj);
      const dim = b.getSize(new THREE.Vector3());
      const k = size / dim[axis];
      obj.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
      const holder = new THREE.Group();
      holder.add(obj);
      holder.scale.setScalar(k);
      holder.position.set(...at);
      holder.rotation.y = turn;
      obj.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.castShadow = true;
        o.receiveShadow = true;
      });
      parent.add(holder);
      collect(parent);
      return { holder, height: dim.y * k };
    });

  // Hand-painted lettering on a plank. `draw(ctx, w, h)` is re-run when the web fonts land.
  const lettering = (w, h, draw, parent, [x, y, z], ry = 0) => {
    const { ctx, texture, canvas } = makeCanvasTexture(512, Math.round((512 * h) / w), { srgb: true });
    const paint = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fffaf0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      draw(ctx, canvas.width, canvas.height);
      texture.needsUpdate = true;
    };
    paint();
    texts.push(paint);
    const plank = box(mats.wood(0xfff4e0), [w, h, 0.028], [x, y, z], parent, 0.006);
    plank.rotation.y = ry;
    const text = new THREE.Mesh(
      PLANE,
      new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 })
    );
    text.scale.set(w * 0.94, h * 0.94, 1);
    text.position.z = 0.0145;
    plank.add(text);
    return plank;
  };

  const fitText = (ctx, text, maxWidth, size, family) => {
    let px = size;
    do {
      ctx.font = `600 ${px}px ${family}`;
      px -= 4;
    } while (ctx.measureText(text).width > maxWidth && px > 20);
  };
  const display = () => cssVar('--font-display', 'Georgia, serif');
  const hand = () => cssVar('--font-hand', 'cursive');

  // Hover glow reaches every (cloned) material in a group.
  function collect(g) {
    g.userData.mats = [];
    g.traverse((o) => o.isMesh && o.material.emissive && g.userData.mats.push(o.material));
  }

  // ---------- about: a bench, with the laptop finally closed ----------
  const bench = place('about', 'sit', 'the bench · about', [1.5, 1.0, 0.7]);
  model('painted_wooden_bench', bench, { size: 1.3 }).then((m) => {
    if (!m) return;
    // the seat sits a little under half the bench's height
    const seat = m.height * 0.72;
    const laptop = box(mats.plain(0x6f737a, { roughness: 0.4, metalness: 0.8 }), [0.31, 0.016, 0.215], [-0.22, seat + 0.01, 0.02], bench, 0.006);
    laptop.rotation.y = 0.22;
    // …and someone left a daisy on it
    const daisy = new THREE.Group();
    const petal = mats.plain(0xf3f1ea, { roughness: 0.6 });
    for (let k = 0; k < 12; k++) {
      const p = add(BALL, petal, [0.0035, 0.001, 0.011], [0, 0, 0], daisy);
      p.rotation.y = (k / 12) * Math.PI * 2;
      p.translateZ(0.012);
    }
    add(BALL, mats.plain(PALETTE.sun), [0.006, 0.003, 0.006], [0, 0.001, 0], daisy);
    daisy.position.set(-0.2, seat + 0.021, 0.04);
    bench.add(daisy);
    collect(bench);
  });

  // ---------- projects: one blossom tree per project ----------
  const pj = STATIONS[stationIndex('projects')];
  const along = pathForward(pj.u + pj.ahead / PATH_LENGTH, new THREE.Vector3());
  const blossomTints = [0xe58fb0, 0xf2e7d5, 0xe6b93a, 0xb9a2e6];
  const projectTrees = projects.map((p, i) => {
    const off = (i - (projects.length - 1) / 2) * 4.6;
    const ground = pj.ground.clone().addScaledVector(along, off);
    const g = place('projects', 'project', `${p.title} · planted`, [2.6, 4, 2.6], ground);
    g.userData.project = i;
    const tree = plantTree(assets, { height: 3.6 + (i % 2) * 0.5, tint: blossomTints[i % blossomTints.length], turn: i * 2.1 });
    tree.userData.onReady = () => collect(g);
    g.add(tree);
    // a name stake in front of it
    add(CYL, mats.wood(0x9a8a70), [0.025, 0.75, 0.025], [-1.5, 0.375, 0.7], g);
    lettering(
      1.0,
      0.32,
      (ctx, w, h) => {
        fitText(ctx, p.title, w - 50, 120, display());
        ctx.fillText(p.title, w / 2, h / 2 + 4);
      },
      g,
      [-1.5, 0.72, 0.73]
    );
    collect(g);
    return g;
  });

  // ---------- music: a radio left on a stump ----------
  const music = place('music', 'toggle-music', 'field radio · play / pause', [0.7, 0.85, 0.7]);
  add(new THREE.CylinderGeometry(0.26, 0.31, 0.38, 22, 1, true).translate(0, 0.19, 0), mats.bark(), [1, 1, 1], [0, 0, 0], music);
  add(new THREE.CircleGeometry(0.26, 22).rotateX(-Math.PI / 2), mats.wood(0xe9dcc0), [1, 1, 1], [0, 0.38, 0], music);
  const radio = new THREE.Group();
  radio.position.y = 0.38;
  music.add(radio);
  model('boombox', radio, { size: 0.46 }).then(() => collect(music));

  // notes drifting off the radio while it plays
  const NOTES = 12;
  const note = makeCanvasTexture(64, 64, { srgb: true });
  note.ctx.fillStyle = '#fff';
  note.ctx.font = '52px serif';
  note.ctx.textAlign = 'center';
  note.ctx.textBaseline = 'middle';
  note.ctx.fillText('♪', 32, 34);
  note.texture.needsUpdate = true;
  const noteGeo = new THREE.BufferGeometry();
  noteGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NOTES * 3), 3));
  const notes = new THREE.Points(
    noteGeo,
    new THREE.PointsMaterial({ map: note.texture, size: 0.14, transparent: true, opacity: 0, depthWrite: false, color: 0xfff6d8, toneMapped: false })
  );
  notes.frustumCulled = false;
  notes.position.y = 0.75;
  music.add(notes);

  // ---------- faq: a signpost ----------
  const post = place('faq', 'ask', 'the signpost · faq', [1.1, 2.3, 0.4]);
  add(CYL, mats.wood(0xffffff, 2), [0.04, 2.25, 0.04], [0, 1.125, 0], post);
  [
    ['who?', 1.95, 0.1],
    ['with what?', 1.6, -0.08],
    ['built what?', 1.25, 0.07],
    ['say hi →', 0.9, -0.06],
  ].forEach(([text, y, ry]) => {
    lettering(
      0.8,
      0.24,
      (ctx, w, h) => {
        fitText(ctx, text, w - 70, 118, hand());
        ctx.fillText(text, w / 2, h / 2 + 4);
      },
      post,
      [0.22, y, 0.062],
      ry
    );
  });
  collect(post);

  // ---------- contact: the mailbox at the end of the path ----------
  const mail = place('contact', 'copy-email', 'mailbox · copy email', [0.45, 1.4, 0.7]);
  box(mats.wood(0xffffff, 2), [0.09, 1.05, 0.09], [0, 0.525, 0], mail, 0.01);
  const shell = mats.enamel(0xd9d2c0);
  box(shell, [0.2, 0.13, 0.46], [0, 1.115, 0], mail, 0.004);
  // half a cylinder laid along the box, rounded side up
  add(new THREE.CylinderGeometry(0.1, 0.1, 0.46, 24, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), shell, [1, 1, 1], [0, 1.18, 0], mail);
  // door rim and latch
  add(new THREE.TorusGeometry(0.094, 0.006, 8, 24, Math.PI), mats.plain(PALETTE.steel, { roughness: 0.4, metalness: 0.9 }), [1, 1, 1], [0, 1.18, 0.231], mail);
  add(BALL, mats.plain(PALETTE.steel, { roughness: 0.4, metalness: 0.9 }), [0.012, 0.012, 0.008], [0, 1.2, 0.236], mail);
  const flag = new THREE.Group();
  flag.position.set(0.106, 1.1, 0.1);
  const red = mats.plain(PALETTE.coral, { roughness: 0.5, metalness: 0.2 });
  box(red, [0.006, 0.26, 0.022], [0, 0.13, 0], flag, 0.002);
  box(red, [0.006, 0.085, 0.12], [0, 0.22, -0.05], flag, 0.002);
  mail.add(flag);
  flag.rotation.x = Math.PI / 2; // down, pointing at the walker
  collect(mail);

  let flagUp = 0;
  let flagUntil = 0;
  let noteAlpha = 0;
  const notePos = noteGeo.attributes.position;

  return {
    group: root,
    interactive,
    pickTargets,
    redrawText() {
      texts.forEach((paint) => paint());
    },
    /** A little bounce: "you clicked me". */
    pulse(g) {
      if (g?.userData && 'pulse' in g.userData) g.userData.pulse = 1;
    },
    pulseProject(i) {
      if (projectTrees[i] && projectTrees[i].userData.pulse < 0.2) projectTrees[i].userData.pulse = 1;
    },
    flashContact(t) {
      flagUntil = t + 2.4;
    },
    update(t, dt, { playing, hovered, reduceMotion }) {
      interactive.forEach((g) => {
        const d = g.userData;
        const glow = d.glow + ((g === hovered ? 1 : 0) - d.glow) * Math.min(1, dt * 10);
        if (Math.abs(glow - d.glow) > 0.001) {
          d.glow = glow;
          d.mats.forEach((m) => m.emissive.setRGB(glow * 0.09, glow * 0.075, glow * 0.04));
        }
        if (d.pulse > 0) {
          d.pulse = Math.max(0, d.pulse - dt * 1.8);
          g.scale.setScalar(1 + Math.sin(d.pulse * Math.PI) * 0.05);
        }
      });

      // the radio thumps a little; you'd feel it in the stump
      const beat = playing && !reduceMotion ? Math.pow(Math.max(0, Math.sin(t * Math.PI * 4)), 6) : 0;
      radio.scale.set(1 + beat * 0.012, 1 + beat * 0.03, 1 + beat * 0.012);

      noteAlpha += ((playing ? 1 : 0) - noteAlpha) * Math.min(1, dt * 3);
      notes.material.opacity = noteAlpha * 0.9;
      if (noteAlpha > 0.01 && !reduceMotion) {
        for (let i = 0; i < NOTES; i++) {
          const life = (t * 0.28 + i / NOTES) % 1;
          notePos.setXYZ(i, Math.sin(i * 2.4 + t * 0.9) * (0.1 + life * 0.4), life * 1.3, Math.cos(i * 1.7) * 0.2);
        }
        notePos.needsUpdate = true;
      }

      flagUp += ((t < flagUntil ? 1 : 0) - flagUp) * Math.min(1, dt * 6);
      flag.rotation.x = (Math.PI / 2) * (1 - flagUp);
    },
  };
}
