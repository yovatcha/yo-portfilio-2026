import * as THREE from 'three';
import { ENV_GLSL } from './glsl.js';

/**
 * Sky dome: three photographed skies (midday → late afternoon → sunset),
 * cross-faded by env.js as the walk goes on. Each photo is turned so its sun
 * sits where the scene's sun light comes from.
 *
 * The photos are already tone-mapped JPGs, so they are written straight to
 * the screen rather than through the renderer's tone mapping.
 */
export const SKY_FILES = ['noon', 'afternoon', 'dusk'];

export function createSky({ env, assets, tier }) {
  const res = tier === 'high' ? '4k' : '2k';
  SKY_FILES.forEach((name, i) => {
    const t = assets.texture(`sky/${name}_${res}.jpg`, { onLoad: () => env.setSky(i, t) });
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.generateMipmaps = false; // no seam where the panorama wraps
    t.minFilter = THREE.LinearFilter;
  });

  const mat = new THREE.ShaderMaterial({
    uniforms: env.uniforms,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${ENV_GLSL}
      uniform sampler2D uSkyA;
      uniform sampler2D uSkyB;
      uniform float uSkyOffA;
      uniform float uSkyOffB;
      uniform float uSkyMix;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float u = atan(d.z, d.x) / 6.2831853 + 0.5;
        // The photos' lower half is a mirrored fill; never look below the horizon.
        float v = 0.5 + asin(clamp(max(d.y, 0.004), -1.0, 1.0)) / 3.14159265;
        vec3 col = texture2D(uSkyA, vec2(u + uSkyOffA, v)).rgb;
        if (uSkyMix > 0.001) col = mix(col, texture2D(uSkyB, vec2(u + uSkyOffB, v)).rgb, uSkyMix);
        // A touch more colour than the flat tone-mapped JPGs carry.
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(l), col, 1.22);
        col = mix(col, uFog, smoothstep(0.045, -0.01, d.y));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.scale.setScalar(1200);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;

  return {
    mesh,
    /** Keep the dome centred on the camera. */
    follow(camera) {
      mesh.position.copy(camera.position);
    },
  };
}
