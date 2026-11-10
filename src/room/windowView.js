import * as THREE from 'three';

/**
 * The view out of the window: a procedural Bangkok skyline at 2 a.m. —
 * layered tower silhouettes with lit windows, out-of-focus city bokeh and
 * rain streaking down the glass. One full-screen-ish shader plane, no textures.
 */
export function createWindowView({ reduceMotion }) {
  const material = new THREE.ShaderMaterial({
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uRain: { value: reduceMotion ? 0 : 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uRain;
      varying vec2 vUv;

      float hash(float n) { return fract(sin(n) * 43758.5453); }
      float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

      // One layer of towers: returns 1 inside a building, with lit windows.
      vec3 skyline(vec2 uv, float cols, float minH, float maxH, float seed, vec3 tint, float lit) {
        float id = floor(uv.x * cols);
        float h = mix(minH, maxH, hash(id + seed));
        if (uv.y > h) return vec3(-1.0);
        vec2 cell = vec2(fract(uv.x * cols), uv.y);
        // window grid inside each tower
        vec2 grid = vec2(cell.x * 6.0, cell.y * 60.0);
        vec2 gid = floor(grid);
        float on = step(1.0 - lit, hash2(gid + id * 13.0 + seed));
        float pane = step(0.25, fract(grid.x)) * step(fract(grid.x), 0.75)
                   * step(0.3, fract(grid.y)) * step(fract(grid.y), 0.7);
        vec3 warm = mix(vec3(1.0, 0.72, 0.4), vec3(0.6, 0.9, 1.0), hash2(gid + 3.0));
        return tint + warm * on * pane * 0.9;
      }

      void main() {
        vec2 uv = vUv;

        // night sky: indigo → magenta light-pollution haze near the horizon
        vec3 col = mix(vec3(0.35, 0.09, 0.28), vec3(0.03, 0.03, 0.09), smoothstep(0.05, 0.8, uv.y));

        // far → near tower layers
        vec3 far = skyline(uv + vec2(0.13, 0.0), 22.0, 0.18, 0.42, 1.0, vec3(0.07, 0.05, 0.14), 0.18);
        if (far.x >= 0.0) col = far;
        vec3 mid = skyline(uv + vec2(0.41, 0.0), 12.0, 0.08, 0.34, 7.0, vec3(0.04, 0.03, 0.08), 0.25);
        if (mid.x >= 0.0) col = mid;
        vec3 near = skyline(uv + vec2(0.77, 0.0), 6.0, 0.02, 0.22, 19.0, vec3(0.02, 0.015, 0.04), 0.3);
        if (near.x >= 0.0) col = near;

        // soft bokeh: blurred city lights floating in front of everything
        for (int i = 0; i < 14; i++) {
          float fi = float(i);
          vec2 c = vec2(hash(fi * 3.1), hash(fi * 7.7) * 0.5);
          c.x = fract(c.x + uTime * 0.004 * (0.5 + hash(fi)));
          float r = 0.03 + hash(fi * 1.3) * 0.05;
          float d = length((uv - c) * vec2(1.6, 1.0));
          vec3 bc = mix(vec3(1.0, 0.45, 0.7), vec3(1.0, 0.7, 0.35), hash(fi * 9.0));
          col += bc * smoothstep(r, r * 0.6, d) * 0.22;
        }

        // rain: thin streaks sliding down in three parallax layers
        float rain = 0.0;
        for (int l = 0; l < 3; l++) {
          float fl = float(l);
          float cols = 90.0 + fl * 60.0;
          float x = uv.x * cols;
          float id = floor(x);
          float speed = 0.6 + hash(id + fl) * 0.8;
          float y = fract(uv.y * (2.0 + fl) + uTime * speed + hash(id * 1.7 + fl));
          float streak = smoothstep(0.0, 0.02, y) * smoothstep(0.12, 0.0, y);
          float lane = smoothstep(0.5, 0.0, abs(fract(x) - 0.5) * 6.0);
          rain += streak * lane * step(0.6, hash(id * 3.3 + fl)) * (0.35 - fl * 0.08);
        }
        col += vec3(0.6, 0.75, 1.0) * rain * uRain;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.6), material);
  return {
    mesh,
    update(t) {
      material.uniforms.uTime.value = t;
    },
  };
}
