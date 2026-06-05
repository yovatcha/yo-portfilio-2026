# 3D Portfolio

An interactive portfolio website built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/). A field of floating geometric objects reacts to your mouse and scroll, with glassmorphism content sections layered on top.

## Getting started

```bash
npm install
npm run dev      # start the dev server (opens the browser)
npm run build    # production build into dist/
npm run preview  # preview the production build
```

## Making it yours

Everything you need to personalize lives in **`index.html`** and the content is plain HTML — no build step needed to edit text.

| What to change | Where |
| --- | --- |
| Name, title, bio | `index.html` — search for `YOUR NAME` and `YOUR TITLE` |
| Brand monogram (top-left) | `.nav__brand` (`YN`) in `index.html` |
| Projects | The `<article class="card">` blocks in the Projects section |
| Skills | The `.skills__group` lists |
| Contact email & socials | `mailto:` link and `.socials` list in the Contact section |
| Colors / theme | CSS variables at the top of `src/style.css` (`--accent`, `--accent-2`, `--bg`) |

### Tweaking the 3D scene

Open `src/scene.js`:

- `COUNT` — number of floating objects
- `geometries` — the shapes used
- `palette` — object colors
- camera, lights, fog, and the float/rotation speeds are all near the top and commented

The scene respects `prefers-reduced-motion` and falls back gracefully.

## Deploy

The build output is a static site in `dist/`. Drop it on any static host (Vercel, Netlify, GitHub Pages, Cloudflare Pages). For Vercel: framework preset **Vite**, build command `npm run build`, output `dist`.
