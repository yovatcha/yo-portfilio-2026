import * as THREE from 'three';

/**
 * Particle-galaxy scene that lives behind the page content.
 *
 * Behaviour:
 *  - Thousands of GPU points form a spiral galaxy with warm core / cool edges.
 *  - The galaxy slowly spins; colors gently shift over time.
 *  - The whole field parallaxes toward the mouse / device tilt.
 *  - Scrolling tilts and zooms the camera through the disc.
 *
 * Returns a small API so main.js can hook scroll + cleanup.
 */
export function createScene(canvas) {
  const scene = new THREE.Scene();

  // ---------- Camera ----------
  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 2.2, 7);
  camera.lookAt(0, 0, 0);

  // ---------- Renderer ----------
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // ---------- Galaxy parameters ----------
  const params = {
    count: 32000,
    radius: 6,
    branches: 4,
    spin: 1.1,
    randomness: 0.45,
    randomnessPower: 2.6,
    insideColor: 0xff8a3d, // warm core
    outsideColor: 0x7c5cff, // cool purple edge
    size: 22,
  };

  const positions = new Float32Array(params.count * 3);
  const colors = new Float32Array(params.count * 3);
  const scales = new Float32Array(params.count);

  const colorInside = new THREE.Color(params.insideColor);
  const colorOutside = new THREE.Color(params.outsideColor);

  for (let i = 0; i < params.count; i++) {
    const i3 = i * 3;

    // Distance from center, biased toward the core.
    const radius = Math.pow(Math.random(), 1.5) * params.radius;
    const branchAngle = ((i % params.branches) / params.branches) * Math.PI * 2;
    const spinAngle = radius * params.spin;

    // Scatter that grows toward the outer disc for a fluffy edge.
    const rand = () =>
      Math.pow(Math.random(), params.randomnessPower) *
      (Math.random() < 0.5 ? 1 : -1) *
      params.randomness *
      radius;

    positions[i3] = Math.cos(branchAngle + spinAngle) * radius + rand();
    positions[i3 + 1] = rand() * 0.5; // flatter on the vertical axis
    positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * radius + rand();

    // Color blends from core to edge by radius.
    const mixed = colorInside.clone().lerp(colorOutside, radius / params.radius);
    colors[i3] = mixed.r;
    colors[i3 + 1] = mixed.g;
    colors[i3 + 2] = mixed.b;

    scales[i] = 0.4 + Math.random() * 0.9;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));

  // Shader gives soft, round, glowing points with size attenuation + twinkle.
  const material = new THREE.ShaderMaterial({
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: params.size * renderer.getPixelRatio() },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uSize;
      attribute float aScale;
      varying vec3 vColor;

      void main() {
        vec4 modelPosition = modelMatrix * vec4(position, 1.0);

        // Spin: rotate faster near the core for a swirling feel.
        float dist = length(modelPosition.xz);
        float angle = atan(modelPosition.z, modelPosition.x);
        angle += (1.0 / (dist + 0.6)) * uTime * 0.25;
        modelPosition.x = cos(angle) * dist;
        modelPosition.z = sin(angle) * dist;

        vec4 viewPosition = viewMatrix * modelPosition;
        gl_Position = projectionMatrix * viewPosition;

        // Twinkle + size attenuation.
        float twinkle = 0.7 + 0.3 * sin(uTime * 2.0 + aScale * 30.0);
        gl_PointSize = uSize * aScale * twinkle;
        gl_PointSize *= (1.0 / -viewPosition.z);

        vColor = color;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;

      void main() {
        // Radial soft falloff -> round glowing dot.
        float d = distance(gl_PointCoord, vec2(0.5));
        float strength = 1.0 - smoothstep(0.0, 0.5, d);
        strength = pow(strength, 1.8);
        gl_FragColor = vec4(vColor, strength);
        if (strength < 0.01) discard;
      }
    `,
  });

  const galaxy = new THREE.Points(geometry, material);
  scene.add(galaxy);

  // A faint distant starfield behind the galaxy for depth.
  const starGeo = new THREE.BufferGeometry();
  const starCount = 600;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount * 3; i++) {
    starPos[i] = (Math.random() - 0.5) * 60;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.06,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    })
  );
  scene.add(stars);

  // ---------- Interaction state ----------
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  let scrollProgress = 0; // 0 → 1 across the whole page

  function onPointerMove(e) {
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }
  window.addEventListener('pointermove', onPointerMove);

  function onOrient(e) {
    if (e.gamma == null || e.beta == null) return;
    mouse.tx = Math.max(-1, Math.min(1, e.gamma / 45));
    mouse.ty = Math.max(-1, Math.min(1, e.beta / 90));
  }
  window.addEventListener('deviceorientation', onOrient);

  // ---------- Resize ----------
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    const pr = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(pr);
    material.uniforms.uSize.value = params.size * pr;
  }
  window.addEventListener('resize', onResize);

  // ---------- Animation loop ----------
  const clock = new THREE.Clock();
  let rafId;
  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  function tick() {
    const t = clock.getElapsedTime();
    if (!reduceMotion) {
      material.uniforms.uTime.value = t;
      stars.rotation.y = t * 0.01;
    }

    // Ease mouse toward target for smooth parallax.
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;

    galaxy.rotation.y += (mouse.x * 0.4 - galaxy.rotation.y) * 0.04;

    // Scroll tilts the disc toward the viewer and pulls the camera in/out.
    const targetTilt = 0.15 + scrollProgress * 0.9;
    galaxy.rotation.x += (targetTilt - galaxy.rotation.x) * 0.05;

    const targetZ = 7 - scrollProgress * 2.5;
    const targetY = 2.2 - scrollProgress * 1.6;
    camera.position.z += (targetZ - camera.position.z) * 0.06;
    camera.position.y += (targetY - camera.position.y) * 0.06;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }
  tick();

  // ---------- Public API ----------
  return {
    setScroll(progress) {
      scrollProgress = progress;
    },
    dispose() {
      cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('deviceorientation', onOrient);
      window.removeEventListener('resize', onResize);
      geometry.dispose();
      material.dispose();
      starGeo.dispose();
      stars.material.dispose();
      renderer.dispose();
    },
  };
}
