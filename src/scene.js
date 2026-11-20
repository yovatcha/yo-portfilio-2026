import * as THREE from 'three';
import { createAssets } from './meadow/assets.js';
import { createEnv } from './meadow/env.js';
import { createSky } from './meadow/sky.js';
import { createTerrain } from './meadow/terrain.js';
import { createPathMask } from './meadow/path.js';
import { createGrass } from './meadow/grass.js';
import { createFlowers } from './meadow/flowers.js';
import { createTrees } from './meadow/trees.js';
import { createLandmarks } from './meadow/landmarks.js';
import { createSkillBed } from './meadow/skillBed.js';
import { createPicker } from './meadow/picking.js';
import { mapPose } from './meadow/overview.js';
import { STATIONS, stationIndex, poseAt } from './meadow/stations.js';

/**
 * "Out of office" — the flower meadow behind the page.
 *
 *  - Scroll walks the camera along the path, one stop per section
 *    (see meadow/stations.js), and through the afternoon into last light.
 *  - Every landmark maps to a section; clicking it walks there, clicking it
 *    again once you've arrived triggers its action (play music, copy email…).
 *  - setMap(true) zooms out to a bird's-eye map of the whole field.
 *
 * The field is built from scanned material — photographed skies, scanned
 * ground, plants and props (meadow/assets.js) — under one sun and sky light
 * that meadow/env.js moves through the day.
 *
 * Returns null when WebGL isn't available — the HTML site stands on its own.
 */

function detectTier() {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  if (!coarse && cores >= 6) return 'high';
  return cores >= 4 ? 'mid' : 'low';
}

const smooth = (t) => t * t * (3 - 2 * t);
const SHADOW_REACH = 20; // metres around the walker that get real shadows

export function createScene(canvas, { projects, skills, onProgress, onReady }) {
  // MSAA on the default framebuffer is fixed at context creation, so the tier
  // has to be known first.
  const tier = detectTier();
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: tier !== 'low', powerPreference: 'high-performance' });
  } catch {
    return null;
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const maxDpr = { high: 1.5, mid: 1.25, low: 1 }[tier];
  let pixelRatio = Math.min(window.devicePixelRatio, maxDpr);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Neutral keeps the greens and the sky's blue where the scans put them.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = tier !== 'low';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Nothing that casts a shadow moves much: re-render the map only as the walker does.
  renderer.shadowMap.autoUpdate = false;
  document.documentElement.dataset.tier = tier;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.05, 2600);

  // ---------- Assets ----------
  const manager = new THREE.LoadingManager();
  let loaded = false;
  manager.onProgress = (_url, done, total) => onProgress?.(done / total);
  manager.onLoad = () => (loaded = true);
  const assets = createAssets({ manager, anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()) });

  // ---------- Light ----------
  const env = createEnv();
  scene.fog = env.fog;
  scene.add(env.sun, env.sun.target, env.hemi);
  if (renderer.shadowMap.enabled) {
    const s = env.sun.shadow;
    env.sun.castShadow = true;
    s.mapSize.setScalar(tier === 'high' ? 2048 : 1024);
    Object.assign(s.camera, { left: -SHADOW_REACH, right: SHADOW_REACH, top: SHADOW_REACH, bottom: -SHADOW_REACH, near: 1, far: 160 });
    s.bias = -0.0004;
    s.normalBias = 0.04;
  }

  // Each photographed sky also lights the scanned props' reflections.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const reflections = [];
  scene.environmentIntensity = 0.5;

  // ---------- Meadow ----------
  const skillStation = STATIONS[stationIndex('skills')];
  // Bare earth wherever something stands beside the path.
  const clearings = STATIONS.filter((s) => s.side !== 0).map((s) => ({
    x: s.ground.x,
    z: s.ground.z,
    r: { skills: 1.5, about: 1.5, projects: 0 }[s.id] ?? 1,
  }));
  const mask = createPathMask(clearings.filter((c) => c.r > 0));

  const sky = createSky({ env, assets, tier });
  const grass = createGrass({ env, mask, tier });
  const flowers = createFlowers({ env, mask, assets, tier });
  const landmarks = createLandmarks({ assets, projects, tier });
  const bed = createSkillBed({ skills, station: skillStation, reduceMotion });
  scene.add(sky.mesh, createTerrain({ env, mask, assets, tier }), createTrees({ assets, tier }), grass.group, flowers.group, landmarks.group, bed.group);

  // Web fonts arrive after first paint — repaint the lettering when they do.
  document.fonts?.ready.then(() => landmarks.redrawText());

  // What the pointer can hit: light stand-in volumes, never the scanned meshes.
  const interactive = [...landmarks.pickTargets, ...bed.proxies];

  // ---------- State ----------
  let station = 0; // float, from scroll
  let stationEased = 0;
  let mapTarget = 0;
  let map = 0; // 0 = walking … 1 = bird's-eye map
  let selectCb = () => {};
  let hoverCb = () => {};
  let skillHoverCb = () => {};
  let mapFrameCb = null;
  let playing = false;
  let wind = 1;
  let hovered = null;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  const walk = { pos: new THREE.Vector3(), target: new THREE.Vector3(), shift: 0, parallax: 1, day: 0, eye: 1.5, u: 0 };
  const top = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  const walkPos = new THREE.Vector3();
  const walkQuat = new THREE.Quaternion();
  const lookM = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  const camRight = new THREE.Vector3();
  const pin = new THREE.Vector3();
  const pins = STATIONS.map(() => ({ x: 0, y: 0 }));
  const shadowAt = new THREE.Vector3(1e9, 0, 0);
  const shadowSun = new THREE.Vector3();
  // The first frames sink from above the field into the hero shot.
  let intro = reduceMotion ? 0 : 1;

  const picker = createPicker({
    camera,
    getTargets: () => interactive,
    handlers: {
      hover(root) {
        hovered = root;
        document.body.classList.toggle('is-pointing', !!root);
        hoverCb(root ? root.userData.label : null);
        const skill = root?.userData.skill ?? null;
        if (skill) bed.highlight(skill);
        skillHoverCb(skill);
      },
      click(root) {
        const { station: id, action, project, skill } = root.userData;
        const arrived = Math.round(station) === stationIndex(id);
        if (!arrived) return selectCb({ station: id, action: 'go' });
        landmarks.pulse(root);
        if (skill) bed.highlight(skill);
        selectCb({ station: id, action, project, skill });
      },
    },
  });

  // ---------- Pointer parallax ----------
  function onPointerMove(e) {
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  // ---------- Resize ----------
  let lastW = 0;
  let lastH = 0;
  function onResize(force) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // A phone's URL bar collapsing changes the height only; don't reallocate
    // the framebuffer (and visibly jump the horizon) for that.
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (force !== true && coarse && w === lastW && Math.abs(h - lastH) < 130) return;
    lastW = w;
    lastH = h;
    camera.aspect = w / h;
    // Tall screens get a wider lens so the valley keeps its breadth.
    camera.fov = THREE.MathUtils.clamp(38 + (1.5 - camera.aspect) * 22, 38, 62);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);
  onResize(true);

  // ---------- Adaptive quality ----------
  // Watch the real frame time; if we can't hold ~50fps, shed the most
  // expensive thing first, one step at a time, and never step back up.
  const degrade = [
    () => setPixelRatio(Math.min(pixelRatio, 1.25)),
    () => grass.setDensity(0.6),
    () => {
      renderer.shadowMap.enabled = false;
      env.sun.castShadow = false;
    },
    () => setPixelRatio(1),
    () => grass.setDensity(0.35),
  ];
  let avgFrame = 1 / 60;
  let sampleFrames = 0;

  function setPixelRatio(pr) {
    if (pr >= pixelRatio) return;
    pixelRatio = pr;
    renderer.setPixelRatio(pr);
    onResize(true);
  }

  function watchPerformance(rawDt) {
    if (!loaded || frame < 160 || !degrade.length) return; // let loading and shader compiling settle
    avgFrame += (rawDt - avgFrame) * 0.05;
    if (++sampleFrames < 90) return;
    sampleFrames = 0;
    if (avgFrame > 1 / 48) {
      degrade.shift()();
      avgFrame = 1 / 60;
    }
  }

  // ---------- Loop ----------
  const clock = new THREE.Clock();
  let clockTime = 0;
  let windTime = 0;
  let rafId = 0;
  let running = true;
  let frame = 0;
  let readyFired = false;

  function frameCamera(dt) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const narrow = w < 820;
    const ease = reduceMotion ? 1 : 1 - Math.exp(-dt * 3.2);

    // Ease the station number, then read the pose off the path exactly.
    stationEased += (station - stationEased) * ease;
    poseAt(stationEased, walk);
    map += (mapTarget - map) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 2.6));
    if (Math.abs(mapTarget - map) < 0.001) map = mapTarget;
    const m = smooth(map);

    walkPos.copy(walk.pos);
    if (intro > 0) {
      intro = Math.max(0, intro - dt * 0.55);
      walkPos.y += smooth(intro) * 5;
    }
    lookM.lookAt(walkPos, walk.target, up);
    walkQuat.setFromRotationMatrix(lookM);

    // Pointer parallax, strongest on the open hero shot.
    if (!reduceMotion) {
      camRight.set(1, 0, 0).applyQuaternion(walkQuat);
      walkPos.addScaledVector(camRight, mouse.x * 0.3 * walk.parallax);
      walkPos.y += -mouse.y * 0.1 * walk.parallax;
    }

    mapPose(camera, top);
    camera.position.lerpVectors(walkPos, top.pos, m);
    camera.quaternion.slerpQuaternions(walkQuat, top.quat, m);

    // Slide the landmark beside the docked sheet; on phones lift the horizon
    // into the top half instead. Neither applies on the map.
    const shift = narrow ? 0 : walk.shift * (1 - m);
    const offsetY = narrow ? h * 0.16 * Math.min(1, stationEased * 2) * (1 - m) : 0;
    camera.setViewOffset(w, h, -shift * w, offsetY, w, h);
    camera.updateMatrixWorld();
    return m;
  }

  // The sun follows the walker so its shadow map stays where the camera is.
  function frameLight() {
    const dir = env.uniforms.uSunDir.value;
    env.sun.target.position.set(Math.round(walk.target.x * 0.5 + walk.pos.x * 0.5), walk.pos.y - walk.eye, Math.round(walk.target.z * 0.5 + walk.pos.z * 0.5));
    env.sun.position.copy(env.sun.target.position).addScaledVector(dir, 80);
    if (!renderer.shadowMap.enabled) return;
    const moved = shadowAt.distanceToSquared(env.sun.target.position) > 0.5 || shadowSun.distanceToSquared(dir) > 1e-5;
    // also refresh while models are still arriving
    if (moved || !loaded || frame % 90 === 0) {
      shadowAt.copy(env.sun.target.position);
      shadowSun.copy(dir);
      renderer.shadowMap.needsUpdate = true;
    }
  }

  function frameReflections() {
    for (let i = 0; i < 3; i++) {
      if (!reflections[i] && env.skyTexture(i)) reflections[i] = pmrem.fromEquirectangular(env.skyTexture(i)).texture;
    }
    const nearest = env.state.k > 0.5 ? env.state.segment + 1 : env.state.segment;
    const next = reflections[nearest] ?? reflections[0] ?? null;
    if (scene.environment !== next) scene.environment = next;
  }

  function tick() {
    if (!running) return;
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    clockTime += dt;
    const t = clockTime;
    frame++;
    watchPerformance(rawDt);

    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;
    const m = frameCamera(dt);

    // The wind picks up while music plays.
    wind += ((playing ? 1.7 : 1) - wind) * Math.min(1, dt * 1.5);
    if (!reduceMotion) windTime += dt * (0.6 + wind * 0.4);
    env.uniforms.uTime.value = windTime;
    env.uniforms.uWind.value = wind;
    env.update(walk.day, m);
    frameLight();
    frameReflections();

    sky.follow(camera);
    grass.follow(walk.pos, walk.target);
    flowers.follow(walk.pos, walk.target);

    // Re-test hover while the camera glides even if the pointer is still.
    if (map < 0.05) picker.update(frame % 6 === 0);
    else picker.clear();

    landmarks.update(t, dt, { playing, hovered, reduceMotion });
    bed.update(windTime, dt, wind);

    renderer.render(scene, camera);

    // Screen positions of the stops, for the HTML pins on the map.
    if (mapFrameCb && map > 0.01) {
      STATIONS.forEach((s, i) => {
        pin.copy(s.stand).project(camera);
        pins[i].x = (pin.x * 0.5 + 0.5) * window.innerWidth;
        pins[i].y = (-pin.y * 0.5 + 0.5) * window.innerHeight;
      });
      mapFrameCb(pins, map);
    }

    // Lift the loader once the scans are in and a couple of frames have drawn.
    if (!readyFired && loaded && frame > 3) {
      readyFired = true;
      onReady?.();
    }
    rafId = requestAnimationFrame(tick);
  }

  function onVisibility() {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(rafId);
    } else if (!running) {
      running = true;
      clock.getDelta();
      tick();
    }
  }
  document.addEventListener('visibilitychange', onVisibility);
  tick();

  // ---------- Public API ----------
  return {
    stations: STATIONS,
    setStation(f) {
      station = f;
    },
    /** Jump straight to the current station (no walk), e.g. from a map pin. */
    snapStation() {
      stationEased = station;
    },
    onSelect(cb) {
      selectCb = cb;
    },
    onHover(cb) {
      hoverCb = cb;
    },
    /** cb(name | null) — a skill flower is under the pointer. */
    onSkillHover(cb) {
      skillHoverCb = cb;
    },
    showProject(i) {
      landmarks.pulseProject(i);
    },
    highlightSkill(name) {
      bed.highlight(name);
    },
    setPlaying(on) {
      playing = on;
    },
    flashContact() {
      landmarks.flashContact(clockTime);
    },
    setMap(on) {
      mapTarget = on ? 1 : 0;
    },
    /** cb(pins: [{x, y}], amount) every frame the map is (partly) open. */
    onMapFrame(cb) {
      mapFrameCb = cb;
    },
    dispose() {
      running = false;
      cancelAnimationFrame(rafId);
      picker.dispose();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      scene.traverse((o) => {
        if (o.isMesh || o.isPoints) {
          o.geometry?.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((mat) => {
            mat.map?.dispose();
            mat.normalMap?.dispose();
            mat.dispose();
          });
        }
      });
      reflections.forEach((r) => r?.dispose());
      pmrem.dispose();
      mask.texture.dispose();
      renderer.dispose();
    },
  };
}
