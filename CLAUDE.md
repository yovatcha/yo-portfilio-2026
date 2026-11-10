# Portfolio Website — Project Context

Chaiyo's portfolio: an interactive 3D "2 a.m. Bangkok condo" diorama (Three.js) with the real content as HTML panels docked beside whatever the camera frames.

## Stack
- **Vite 5** + **three@0.169** (vanilla, no framework) + **cannon-es** (skill-orb physics).
- `npm run dev` / `npm run build` (→ `dist/`) / `npm run preview`. Deployed on Vercel; `api/spotify.js` is a serverless function.
- `vite.config.js` pre-renders projects + skills into the static HTML for SEO/AI crawlers (via `src/render.js`). Keep `render.js` DOM-free.

## File Structure
- `index.html` — markup, SEO meta, JSON-LD, FAQ. Content stays real HTML (hybrid design).
- `src/main.js` — boots the scene, scroll → station, nav, Spotify, copy-email, cursor, room↔page wiring.
- `src/scene.js` — renderer, post-processing (bloom + grain), camera, picking, loop, public API.
- `src/room/build.js` — procedural room; interactive groups tagged with `userData.station/action/label`.
- `src/room/stations.js` — camera pose per section (`STATIONS`) + scroll tracker.
- `src/room/skillJar.js` — glass case of physics orbs from `skills.json`.
- `src/room/screens.js` — canvas-drawn monitor / phone / neon sign / poster.
- `src/room/windowView.js` — skyline + rain shader. `src/room/picking.js` — raycast hover/click/drag.
- `src/projects.json`, `src/skills.json`, `src/tracks.json` — content data. Static assets in `src/public/`.

## Conventions
- Theme tokens live in `:root` of `src/style.css` (`--neon`, `--cyan`, `--amber`, fonts). 3D colors mirror them in `src/room/materials.js` (`PALETTE`).
- Section order = station order: hero, about, projects, skills, music, faq, contact. Adding a section means adding a `STATIONS` entry.
- Quality tiers (`high/mid/low`) set in `scene.js` `detectTier`; low = no bloom/shadows. Respect `prefers-reduced-motion`. No WebGL → `html.no-webgl`, plain page.
- Responsive breakpoint is `820px` (panels go full-width, room framed in the top half).
