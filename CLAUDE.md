# Portfolio Website — Project Context

Chaiyo's portfolio: an interactive, photoreal 3D flower meadow (Three.js) you walk through by scrolling, with the real content as HTML paper sheets docked beside whatever the camera frames. Story: Chaiyo loves flowers and escapes the working day — the meadow starts as a wallpaper on a work screen, and the walk runs from midday into sunset.

## Stack
- **Vite 5** + **three@0.169** (vanilla, no framework). No physics.
- `npm run dev` / `npm run build` (→ `dist/`) / `npm run preview`. Deployed on Vercel; `api/spotify.js` is a serverless function.
- `vite.config.js` pre-renders projects + skills into the static HTML for SEO/AI crawlers (via `src/render.js`). Keep `render.js` DOM-free, and keep the two empty divs (`#projects-grid`, `#bubbles`) in `index.html` byte-identical — the prerender string-matches them.

## File Structure
- `index.html` — markup, SEO meta, JSON-LD, FAQ. Content stays real HTML (hybrid design).
- `src/main.js` — boots the scene, scroll → station, nav, map mode, Spotify, copy-email, cursor, meadow↔page wiring.
- `src/scene.js` — renderer, lights + shadows, camera (walk pose ↔ map pose), picking, adaptive quality, loop, public API.
- `src/meadow/stations.js` — one stop per section (`STATIONS`: position `u` on the path, landmark offset, `shift`, `day`) + scroll tracker + `poseAt`.
- `src/meadow/path.js` — the spline and the ground mask (R path, G clearings, B map route).
- `src/meadow/env.js` — time of day: sun, sky light, haze and sky cross-fade from one `day` value. `sky.js` — the photographed sky dome.
- `src/meadow/terrain.js` — `heightAt` in JS and GLSL from one constants array; scanned ground + path.
- `src/meadow/grass.js` / `flowers.js` — instanced blades, daisies and scanned plant patches that wrap around the walker. `trees.js` — the scanned tree (two weights).
- `src/meadow/landmarks.js` — bench, blossom trees (one per project), radio, signpost, mailbox; tagged with `userData.station/action/label`. `skillBed.js` — one flower per skill.
- `src/meadow/assets.js` — texture / GLB loading, `bakeModel`. `materials.js` — surfaces for hand-built props.
- `src/meadow/overview.js` — the bird's-eye map pose. `picking.js` — raycast hover/click.
- `src/projects.json`, `src/skills.json`, `src/tracks.json` — content data. Static assets in `src/public/` (`public/ref/` is reference art only, not served).

## Assets
- `src/public/sky`, `textures`, `models` are Poly Haven scans (CC0, listed in `src/public/CREDITS.md`), about 8.7 MB in total; a visitor downloads one sky resolution (4k on the high tier, 2k otherwise).
- Sources are far too big to ship (8k skies, a 46 MB tree). Resize images to 1k–4k JPG; run models through `npx @gltf-transform/cli optimize … --compress meshopt --texture-compress webp` (with `--simplify-ratio` for the tree).
- Each sky key in `env.js` records where the sun sits in its photo (`sunU`); the dome is rotated so it matches the light direction. Swapping a sky means re-measuring that.

## Conventions
- The look is photographic, not stylised: scanned skies, ground, plants and props under one sun + hemisphere light, `NeutralToneMapping`. Don't add toon shading, flat colour blobs or canvas-drawn sprites to the scene.
- Standard PBR materials for meshes. Grass and scattered plants use custom shaders that light with the same sun / sky values (`env.uniforms`) and end with `OUTPUT_GLSL` (tone mapping, output conversion, haze), so they sit in the same picture. The sky photos are already tone-mapped and are written straight to the screen.
- Triangle count is the budget that matters (the scene is geometry-bound, not fill-bound): keep the whole frame near 2M. The scanned plants are metre-wide patches of several thousand triangles — dozens of instances, not hundreds.
- Never raycast the scanned meshes: landmarks are picked through invisible stand-in boxes (`reach` in `landmarks.js`), skill flowers through proxy spheres.
- Theme tokens live in `:root` of `src/style.css` (`--paper`, `--ink`, `--accent`, fonts). Paper and ink are constant; only `--accent` and the `theme-color` meta follow `html[data-station]`.
- Section order = station order: hero, about, projects, skills, music, faq, contact. Adding a section means adding a `STATIONS` entry and a `.rail` link (the rail links are also the map pins, matched by index). Sheets dock right for about/skills/faq, so their landmarks stand left of the path (`side` and `shift` negative).
- Camera easing happens on the station number, never on position — the pose is always read off the spline. The tracker drifts forward (`HOLD`) while a section fills the viewport.
- Map mode: `html.is-map` locks scroll and hides sections; `M` toggles, `Esc` exits. Don't intercept pinch / ctrl+wheel (browser zoom).
- Quality tiers (`high/mid/low`) set in `scene.js` `detectTier` drive sky resolution, shadows, normal maps and instance counts; the `degrade` ladder sheds DPR, grass density and shadows. Respect `prefers-reduced-motion` (wind stops, camera cuts). No WebGL → `html.no-webgl`, plain page.
- Responsive breakpoint is `820px` (sheets go full-width, meadow framed in the top half); the nav collapses at `760px`.
