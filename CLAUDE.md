# Portfolio Website — Project Context

A single-page developer portfolio with a Three.js animated particle background. Dark, futuristic aesthetic.

## Stack
- **Plain HTML/CSS/JS** — no build step, no framework, no dependencies to install.
- **Three.js r128** loaded from CDN (cdnjs) for the 3D particle field.
- Everything lives in one file: `index.html` (HTML + CSS in `<style>` + JS in `<script>`).

## Run / Preview
Just open `index.html` in a browser. For a local server (optional):
```
python3 -m http.server 8000   # then visit http://localhost:8000
```

## File Structure
- `index.html` — the entire site (markup, styles, scripts).
- `CLAUDE.md` — this file.

## Code Layout (inside index.html)
- `:root` CSS variables define the theme (colors, fonts, spacing). Change accent colors here: `--neon`, `--neon-2`, `--neon-3`.
- Sections in order: `nav`, `.hero`, `#about`, `#work`, `#skills`, `#contact`, `footer`.
- First `<script>` (IIFE): Three.js particle field — scene, ~2600 points, mouse parallax, scroll-driven camera depth.
- Second `<script>`: UI behavior — sticky nav, IntersectionObserver scroll-reveal (`.reveal` → `.in`), card cursor glow.

## Conventions
- Keep it a single self-contained file unless asked to split.
- Use CSS variables for any color/theme change — don't hardcode hex values in components.
- Particle tuning lives in the IIFE: `COUNT` (particle count), `mat.size`, `palette` (colors), camera positions.
- Animations use `transform`/`opacity` only, for GPU performance.
- Responsive breakpoint is `820px`.

## Placeholder Content To Replace
Real details still need to be filled in:
- Name/tagline in `.hero` and the `.logo`
- 4 project cards under `#work` (titles, descriptions, tech chips, links)
- Skills list, about blurb
- Contact email + social links (`.socials`)

## Design Intent
Dark futuristic: black background, neon teal/indigo/pink accents, glassmorphism cards, subtle glow. Keep it minimal and fast — avoid heavy libraries or clutter.
