// Shader chunks shared by the meadow's custom materials (grass, scattered
// plants). They light in linear space with the same sun / sky values the
// standard materials get, then go through three's tone mapping and output
// conversion, so everything sits in one picture.

export const ENV_GLSL = /* glsl */ `
  uniform float uTime;
  uniform float uWind;
  uniform float uMap;
  uniform vec3 uSunDir;
  uniform vec3 uSunCol;
  uniform vec3 uSkyCol;
  uniform vec3 uGroundCol;
  uniform vec3 uFog;
  uniform float uFogDensity;
`;

export const NOISE_GLSL = /* glsl */ `
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }
  // Broad lusher and drier swathes across the field.
  float grassPatch(vec2 w) {
    return vnoise(w * 0.045) * 0.6 + vnoise(w * 0.17 + 7.3) * 0.4;
  }
  // Gusts rolling over the hills.
  float gust(vec2 w) {
    return smoothstep(0.5, 1.0, sin(dot(w, vec2(0.085, 0.05)) - uTime * 0.7) * 0.5 + 0.5);
  }
  // Soft cloud shadows drifting across the ground (1 = full sun).
  float cloudShade(vec2 w) {
    float n = vnoise(w * 0.011 + uTime * 0.012) * 0.65 + vnoise(w * 0.027 - uTime * 0.008) * 0.35;
    return 1.0 - 0.42 * smoothstep(0.5, 0.72, n);
  }
`;

// Fragment side: sun + sky light on a thin leaf, with light shining through
// when the sun is behind it. Needs ENV_GLSL and <common>.
export const LEAF_LIGHT_GLSL = /* glsl */ `
  vec3 leafLight(vec3 albedo, vec3 n, vec3 viewDir, float sunShade, float thin) {
    float ndl = dot(n, uSunDir);
    float wrap = clamp(ndl * 0.6 + 0.4, 0.0, 1.0);
    vec3 hemi = mix(uGroundCol, uSkyCol, n.y * 0.5 + 0.5);
    vec3 col = albedo * RECIPROCAL_PI * (uSunCol * wrap * sunShade + hemi);
    // back-lit: brighter and yellower
    float through = pow(clamp(dot(-viewDir, uSunDir), 0.0, 1.0), 3.0) * thin;
    col += albedo * vec3(1.25, 1.2, 0.45) * RECIPROCAL_PI * uSunCol * through * sunShade;
    return col;
  }
`;

// Ends a custom fragment shader the way the built-in materials end theirs.
export const OUTPUT_GLSL = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  {
    float fogF = 1.0 - exp(-uFogDensity * uFogDensity * vDist * vDist);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uFog, clamp(fogF, 0.0, 1.0));
  }
`;
