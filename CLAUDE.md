# Portfolio Website — Project Context

Chaiyo's portfolio: a seeded halftone "garden print" (one WebGL shader on a fixed canvas) behind real HTML content. Visitors plant flowers and grow vines on the hero; scrolling turns the navy print into cream paper.

## Stack
- **Vite 5**, vanilla JS (no framework). The garden is hand-written WebGL + 2D canvas.
- `npm run dev` / `npm run build` (→ `dist/`) / `npm run preview`. Deployed on Vercel; `api/spotify.js` is a serverless function.
- `vite.config.js` pre-renders projects + skills into the static HTML for SEO/AI crawlers (via `src/render.js`). Keep `render.js` DOM-free.

## File Structure
- `index.html` — markup, SEO meta, JSON-LD, FAQ. Content stays real HTML.
- `src/main.js` — boots the garden, scroll (paper edge + parallax), nav, Spotify, burn portrait, reveal, copy-email, garden↔page wiring.
- `src/art/garden.js` — the garden: planting, vines, pointer, loop, public API (`plantAt`, `setPaper`, `setScroll`, `spotlight`, `burst`, `savePoster`…).
- `src/art/flowers.js` — flower/vine/petal models + drawing into the soft ink canvas; `composeGarden` lays out the opening arrangement.
- `src/art/print.js` — the halftone shader ("the press") + `PALETTE`. `src/art/seed.js` — seeds / `?seed=` / RNG.
- `src/art/burn.js` — About portrait as a film print that burns away.
- `src/projects.json`, `src/skills.json`, `src/tracks.json` — content data. Static assets in `src/public/`.
- `src/scene.js`, `src/room/*` — the old 3D condo; no longer imported by `main.js`.

## Conventions
- Theme tokens live in `:root` of `src/style.css`; shader colors mirror them in `src/art/print.js` (`PALETTE`).
- Parallax: the garden's far/near layers rise at `FAR_RATE`/`NEAR_RATE` (garden.js); flowers are stored in layer space, so convert viewport y with `nearY`/`layerY`. HTML parallax: `--hero-p` on the hero, and `data-parallax="<speed>"` on any element (→ `--py`, applied with CSS `translate` so it stacks with `transform`s). Halved at ≤820px via `--parallax-k`.
- Respect `prefers-reduced-motion` (no parallax, no ambient motion). No WebGL → `html.no-webgl`, plain page.
- Responsive breakpoint is `820px`.
