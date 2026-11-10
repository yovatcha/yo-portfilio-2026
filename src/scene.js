import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildRoom } from './room/build.js';
import { configureTextures } from './room/materials.js';
import { createSkillJar } from './room/skillJar.js';
import { createPicker } from './room/picking.js';
import { STATIONS, stationIndex, poseAt } from './room/stations.js';

/**
 * "Chaiyo's room" — the interactive 3D diorama behind the page.
 *
 *  - Scroll moves the camera between stations (see room/stations.js).
 *  - Every object maps to a section; clicking it flies there, clicking it
 *    again once you've arrived triggers its action (cycle projects, play
 *    music, copy email…).
 *  - Skill orbs are physics bodies you can grab and throw.
 *
 * Returns null when WebGL isn't available — the HTML site stands on its own.
 */

// Film grain + vignette, applied last in display space.
const GrainShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float n = rand(vUv * 1000.0 + fract(uTime) * 100.0) - 0.5;
      c.rgb += n * 0.025;
      float v = smoothstep(1.05, 0.35, length(vUv - 0.5));
      c.rgb *= mix(0.8, 1.0, v);
      gl_FragColor = c;
    }
  `,
};

function detectTier(renderer) {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  if (!renderer.capabilities.isWebGL2) return 'low';
  if (!coarse && cores >= 6) return 'high';
  return cores >= 4 ? 'mid' : 'low';
}

export function createScene(canvas, { projects, skills, portraitUrl, onProgress, onReady }) {
  let renderer;
  try {
    // MSAA lives on the composer's render target instead (see below); the
    // default framebuffer only needs it when there is no post-processing.
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch {
    return null;
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tier = detectTier(renderer);
  const maxDpr = { high: 1.75, mid: 1.25, low: 1 }[tier];
  let pixelRatio = Math.min(window.devicePixelRatio, maxDpr);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  renderer.shadowMap.enabled = tier !== 'low';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // The room is static: render shadow maps on demand, not every frame.
  renderer.shadowMap.autoUpdate = false;
  document.documentElement.dataset.tier = tier;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07070c);
  scene.fog = new THREE.Fog(0x07070c, 11, 24);

  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.05, 60);

  // ---------- Assets ----------
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => onProgress?.(loaded / total);
  const portrait = new THREE.TextureLoader(manager).load(portraitUrl);
  portrait.colorSpace = THREE.SRGBColorSpace;
  configureTextures({
    manager,
    anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
    full: tier !== 'low', // low tier: albedo only, no normal/ARM maps
  });

  // Soft studio reflections for metal, glass and clear-coated surfaces.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = envMap;
  scene.environmentIntensity = 0.35;

  // ---------- Room ----------
  const room = buildRoom({ projects, portrait, reduceMotion });
  scene.add(room.root);
  const jar = createSkillJar({ skills, anchor: room.jarAnchor, manager, tier });
  scene.add(jar.group);
  jar.group.userData = { station: 'skills', action: 'shake', label: 'skills.jar · drag the orbs' };

  if (renderer.shadowMap.enabled) {
    const lamp = room.lights.lamp;
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    lamp.shadow.bias = -0.0005;

    // Key light shadow covers the whole diorama.
    const key = room.lights.key;
    key.castShadow = true;
    key.shadow.mapSize.setScalar(tier === 'high' ? 2048 : 1024);
    Object.assign(key.shadow.camera, { left: -5.5, right: 5.5, top: 5.5, bottom: -5.5, near: 1, far: 22 });
    key.shadow.normalBias = 0.02;
    key.shadow.bias = -0.0003;

    scene.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      // screens and glass light / refract — they shouldn't block light
      const passive = m.transparent || m.isMeshBasicMaterial || m.transmission > 0 || m.isShaderMaterial;
      o.castShadow = !passive;
      o.receiveShadow = !m.isMeshBasicMaterial && !m.isShaderMaterial;
    });
    const noCast = (obj) => obj.traverse((o) => (o.castShadow = false));
    jar.group.children.forEach((c) => c.userData.orb && noCast(c));
    [room.parts.vinyl, room.parts.tonearm, ...room.parts.cones].forEach(noCast);
  }

  // Web fonts arrive after first paint — redraw canvas text when they do.
  document.fonts?.ready.then(() => {
    room.redrawText();
    jar.redrawText();
  });

  // ---------- Floating labels (visible on the overview shot) ----------
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.className = 'room-labels';
  canvas.after(labelRenderer.domElement);
  const interactive = [room.groups.photo, room.groups.monitor, jar.group, room.groups.music, room.groups.window, room.groups.phone];
  jar.group.userData.labelPos = new THREE.Vector3(0, 0.62, 0);
  interactive.forEach((g) => {
    const idx = stationIndex(g.userData.station);
    const el = document.createElement('span');
    el.className = 'room-tag';
    el.innerHTML = `<b>0${idx}</b>${g.userData.label.split(' · ')[1] ?? g.userData.label}`;
    const obj = new CSS2DObject(el);
    obj.position.copy(g.userData.labelPos);
    g.add(obj);
  });

  // ---------- Post-processing ----------
  let composer = null;
  let grainPass = null;
  let gtaoPass = null;
  let bloomPass = null;
  if (tier !== 'low') {
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: tier === 'high' ? 4 : 2,
    });
    composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.addPass(new RenderPass(scene, camera));
    // Ambient occlusion: contact darkening in corners, under the desk, between orbs.
    // Computed at half resolution — it's soft anyway, and 4x cheaper.
    if (tier === 'high') {
      gtaoPass = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
      const fullSetSize = gtaoPass.setSize.bind(gtaoPass);
      gtaoPass.setSize = (w, h) => fullSetSize(Math.ceil(w / 2), Math.ceil(h / 2));
      gtaoPass.updateGtaoMaterial({ radius: 0.3, distanceExponent: 1.5, thickness: 1, scale: 1 });
      gtaoPass.blendIntensity = 0.9;
      composer.addPass(gtaoPass);
    }
    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 2, 0.35, 1.05);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    grainPass = new ShaderPass(GrainShader);
    composer.addPass(grainPass);
  }

  // ---------- State ----------
  let station = 0; // float, from scroll
  let selectCb = () => {};
  let hoverCb = () => {};
  let playing = false;
  let spinUntil = 0;
  let flickerUntil = 0;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  const desired = { pos: new THREE.Vector3(), target: new THREE.Vector3(), shift: 0, parallax: 1 };
  const look = new THREE.Vector3();
  let shift = 0;

  // Start high above the room; the first frames glide down into the hero shot.
  poseAt(0, desired);
  camera.position.copy(desired.pos).add(new THREE.Vector3(4, 6, 6));
  look.copy(desired.target);

  // ---------- Hover glow ----------
  const glowColor = new THREE.Color(0x4ff3ff);
  const hoverState = new Map(interactive.map((g) => [g, 0]));
  let hovered = null;

  const picker = createPicker({
    camera,
    getTargets: () => interactive,
    handlers: {
      hover(root) {
        hovered = root;
        document.body.classList.toggle('is-pointing', !!root);
        hoverCb(root ? root.userData.label : null);
      },
      press(hit) {
        if (!hit.root.userData.orb) return false;
        return jar.startDrag(hit.object, hit.point, camera);
      },
      drag(raycaster) {
        jar.drag(raycaster);
      },
      release() {
        jar.endDrag();
      },
      click(root) {
        const { station: id, action, orb } = root.userData;
        const target = stationIndex(id);
        const arrived = Math.abs(station - target) < 0.15;
        if (orb) return; // orbs are for throwing; a tap is fine as-is
        if (!arrived) return selectCb({ station: id, action: 'go' });
        switch (action) {
          case 'next-project':
            room.monitorScreen.next();
            break;
          case 'spin-photo':
            spinUntil = clockTime + 1.2;
            break;
          case 'shake':
            jar.shake();
            break;
          case 'rain':
            room.setRain(!room.rain);
            break;
          case 'flicker':
            flickerUntil = clockTime + 1.4;
            break;
        }
        selectCb({ station: id, action });
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
  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    composer?.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  // ---------- Adaptive quality ----------
  // Watch the real frame time; if we can't hold ~50fps, shed the most
  // expensive effect first, one step at a time, and never step back up.
  const degrade = [
    () => gtaoPass && (gtaoPass.enabled = false),
    () => setPixelRatio(Math.min(pixelRatio, 1.25)),
    () => bloomPass && (bloomPass.enabled = false),
    () => setPixelRatio(1),
  ];
  let avgFrame = 1 / 60;
  let sampleFrames = 0;

  function setPixelRatio(pr) {
    if (pr >= pixelRatio) return;
    pixelRatio = pr;
    renderer.setPixelRatio(pr);
    composer?.setPixelRatio(pr);
    onResize();
  }

  function watchPerformance(rawDt) {
    if (frame < 120 || !degrade.length) return; // let loading/compiling settle
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
  let rafId = 0;
  let running = true;
  let frame = 0;
  let readyFired = false;
  let vinylSpeed = 0;
  let armAngle = 0.5;
  const camRight = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  function frameCamera(dt) {
    poseAt(station, desired);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const narrow = w < 820;

    // Portrait screens: pull back so the object still fits, frame it up top.
    const aspect = w / h;
    const k = aspect < 1.5 ? Math.min(2.3, 1.55 / aspect) : 1;
    desired.pos.sub(desired.target).multiplyScalar(k).add(desired.target);

    // Pointer parallax, stronger on the overview.
    if (!picker.dragging && !reduceMotion) {
      camRight.setFromMatrixColumn(camera.matrixWorld, 0);
      tmp.copy(camRight).multiplyScalar(mouse.x * 0.35 * desired.parallax);
      desired.pos.add(tmp);
      desired.pos.y += -mouse.y * 0.2 * desired.parallax;
    }

    const ease = reduceMotion ? 1 : 1 - Math.exp(-dt * 3.2);
    camera.position.lerp(desired.pos, ease);
    look.lerp(desired.target, ease);
    camera.lookAt(look);

    const targetShift = narrow ? 0 : desired.shift;
    shift += (targetShift - shift) * ease;
    const offsetY = narrow && Math.round(station) > 0 ? h * 0.16 : 0;
    camera.setViewOffset(w, h, -shift * w, offsetY, w, h);
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
    frameCamera(dt);

    // Re-test hover while the camera glides even if the pointer is still.
    picker.update(frame % 6 === 0);

    if (!reduceMotion) room.update(t);
    jar.step(dt);

    // hover glow
    hoverState.forEach((v, g) => {
      const next = v + ((g === hovered ? 1 : 0) - v) * Math.min(1, dt * 10);
      if (Math.abs(next - v) < 0.001) return;
      hoverState.set(g, next);
      g.traverse((o) => {
        if (o.isMesh && o.material.isMeshStandardMaterial && !o.userData.orb) {
          o.material.emissive.copy(glowColor).multiplyScalar(next * 0.22);
        }
      });
    });

    // photo spin on click
    const inner = room.parts.photoInner;
    if (t < spinUntil) {
      const p = 1 - (spinUntil - t) / 1.2;
      inner.rotation.y = (1 - Math.pow(1 - p, 3)) * Math.PI * 2;
      renderer.shadowMap.needsUpdate = true;
    } else if (inner.rotation.y !== 0) {
      inner.rotation.y = 0;
      renderer.shadowMap.needsUpdate = true;
    }
    if (frame < 4) renderer.shadowMap.needsUpdate = true;

    // neon: flicker on intro / click, breathe with the beat while playing
    const beat = playing ? Math.pow(Math.max(0, Math.sin(t * Math.PI * 4)), 6) : 0;
    let neon = 1;
    if (t < flickerUntil && !reduceMotion) neon = Math.random() > 0.35 ? 1 : 0.15;
    room.signMat.opacity = neon;
    room.lights.neon.intensity = 2.5 * neon + beat * 1.5;

    // turntable + speakers
    vinylSpeed += ((playing ? 3.49 : 0) - vinylSpeed) * Math.min(1, dt * 2);
    room.parts.vinyl.rotation.y -= vinylSpeed * dt;
    armAngle += ((playing ? 0.95 : 0.5) - armAngle) * Math.min(1, dt * 3);
    room.parts.tonearm.rotation.y = armAngle;
    room.parts.cones.forEach((c) => c.scale.set(1 + beat * 0.12, 1 + beat * 0.5, 1 + beat * 0.12));
    room.parts.leds.forEach((l) => l.material.color.setRGB(0.3, playing ? 2.5 : 0.4, playing ? 2.8 : 0.5));

    if (grainPass) grainPass.uniforms.uTime.value = t;
    if (composer) composer.render(dt);
    else renderer.render(scene, camera);

    // Object tags only exist on the overview — skip the DOM work elsewhere.
    const showLabels = station < 0.4;
    labelRenderer.domElement.classList.toggle('is-visible', showLabels);
    if (station < 0.8) labelRenderer.render(scene, camera);

    if (!readyFired && frame > 2) {
      readyFired = true;
      flickerUntil = t + 1.6;
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
    onSelect(cb) {
      selectCb = cb;
    },
    onHover(cb) {
      hoverCb = cb;
    },
    showProject(i) {
      room.monitorScreen.show(i);
    },
    highlightSkill(name) {
      jar.highlight(name);
    },
    setPlaying(on) {
      playing = on;
    },
    flashPhone() {
      room.phoneScreen.flashCopied();
    },
    dispose() {
      running = false;
      cancelAnimationFrame(rafId);
      picker.dispose();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      jar.dispose();
      labelRenderer.domElement.remove();
      scene.traverse((o) => {
        if (o.isMesh || o.isPoints) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
            m.map?.dispose();
            m.dispose();
          });
        }
      });
      composer?.dispose();
      envMap.dispose();
      renderer.dispose();
    },
  };
}
