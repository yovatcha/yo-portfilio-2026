# Design Document: Portfolio Best Practices Refactor

## Overview

This document describes the technical design for refactoring the Three.js portfolio from a single-file architecture into a well-structured, tested, and production-hardened project. The refactor is purely additive — no visual changes, no dependency swaps, no removal of features. The goal is to layer modern development practices (linting, testing, code splitting, accessibility, security headers) on top of the existing working codebase.

**Constraints carried through the entire design:**
- Static site — no Node server, so HTTP security headers go in a `_headers` file (Netlify/Vercel) and a `<meta http-equiv="Content-Security-Policy">` tag
- No framework — vanilla ES modules only
- Prerender plugin in `vite.config.js` must keep working after any module split
- Three.js and Spotify IFrame API remain required dependencies
- Visual design is completely unchanged

---

## Architecture

### Current State

```
src/
  main.js      ← 190 lines doing everything
  scene.js     ← Three.js galaxy, already well-encapsulated
  render.js    ← pure markup builders (shared with vite.config)
  style.css
  skills.json / projects.json / tracks.json
index.html
vite.config.js
```

### Target State

```
src/
  main.js          ← entry point: imports and wires modules (~30 lines)
  scene.js         ← unchanged (already single-responsibility)
  render.js        ← unchanged (already pure, shared with vite.config)
  nav.js           ← mobile nav toggle + focus management
  scroll.js        ← scroll-driven scene update + reveal observer
  spotify.js       ← Spotify IFrame API controller
  interactions.js  ← tilt effect, copy-email, footer year
  error.js         ← global error boundary + WebGL detection
  style.css        ← unchanged
  skills.json / projects.json / tracks.json

src/tests/
  render.test.js
  nav.test.js
  spotify.test.js
  interactions.test.js
  error.test.js

_headers             ← security headers for Netlify/Vercel
public/              ← (already src/public, no change)
.eslintrc.js
.prettierrc
.husky/pre-commit
lint-staged config in package.json
vitest.config.js
```

---

## Components and Interfaces

### 1. Module Split (`src/main.js` → focused modules)

**`src/nav.js`**
```js
/**
 * @param {{ nav: Element, navToggle: HTMLButtonElement, navMenu: Element }} els
 */
export function initNav({ nav, navToggle, navMenu }) { … }
```
Responsibilities: hamburger toggle (`setOpen`), close-on-link-click, close-on-outside-click, focus return to `navToggle` after close.

**`src/scroll.js`**
```js
/**
 * @param {{ setScroll: (progress: number) => void }} experience
 */
export function initScroll(experience) { … }

/**
 * Wires IntersectionObserver reveal animations.
 */
export function initReveal() { … }
```

**`src/spotify.js`**
```js
/**
 * @param {{ mount: Element, nowEl: Element|null, navPlay: Element|null, loadingEl: Element|null }} els
 * @param {Array<{id: string, type?: string}>} fallbackTracks
 */
export async function initSpotify(els, fallbackTracks) { … }
```
Responsibilities: pool management, random-track picker, IFrame API bootstrap, nav-play toggle, shuffle button.

**`src/interactions.js`**
```js
export function initTilt(aboutPhoto) { … }
export function initCopyEmail(copyBtn, emailLink) { … }
export function initFooterYear(yearEl) { … }
```

**`src/error.js`**
```js
/** Returns true if WebGL is available. */
export function isWebGLAvailable() { … }

/** Registers a global window.onerror handler. */
export function initErrorBoundary() { … }
```

**`src/main.js` after split (~30 lines)**
```js
import './style.css';
import { isWebGLAvailable, initErrorBoundary } from './error.js';
import { createScene } from './scene.js';
import { initNav } from './nav.js';
import { initScroll, initReveal } from './scroll.js';
import { initSpotify } from './spotify.js';
import { initTilt, initCopyEmail, initFooterYear } from './interactions.js';
import { renderBubbles, renderProjects } from './render.js';
import skills from './skills.json';
import projects from './projects.json';
import tracks from './tracks.json';

initErrorBoundary();

const canvas = document.getElementById('webgl');
const experience = isWebGLAvailable()
  ? createScene(canvas)
  : { setScroll: () => {}, dispose: () => {} };

// … remaining wiring
```

### 2. ESLint + Prettier Configuration

**`.eslintrc.js`**
```js
export default [
  { files: ['src/**/*.js'], ...eslint.configs.recommended },
  { plugins: { 'jsx-a11y': a11yPlugin }, rules: { … } },
];
```
Rules enabled: `no-console` (warn), `prefer-const`, `unicorn/prefer-string-replace-all`, `no-nested-ternary`, `jsx-a11y/interactive-supports-focus`.

**`.prettierrc`**: single quotes, 2-space indent, trailing comma ES5, 100 print width.

**`lint-staged` config in `package.json`**:
```json
"lint-staged": {
  "src/**/*.{js,json}": ["eslint --fix", "prettier --write"],
  "*.{html,css,md}": ["prettier --write"]
}
```

**Husky pre-commit hook**: runs `npx lint-staged`.

### 3. Vite Configuration Enhancements

**Code splitting via `build.rollupOptions`**:
```js
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        three: ['three'],
      },
    },
  },
  sourcemap: mode === 'development',
}
```
Three.js (~600 KB) is split into its own chunk. The main entry remains small. The prerender plugin continues to work because it only uses `render.js`, not `scene.js` or `three`.

**Bundle analyzer** via `rollup-plugin-visualizer`:
```js
import { visualizer } from 'rollup-plugin-visualizer';
plugins: [prerenderContent(), visualizer({ open: false, filename: 'dist/stats.html' })]
```
Run with `ANALYZE=true vite build` — the stats.html is generated in `dist/` but excluded from deployment.

**Environment-specific sourcemaps**:
```js
build: {
  sourcemap: process.env.NODE_ENV === 'development',
}
```

### 4. Accessibility Additions

**Skip link in `index.html`** (first element inside `<body>`):
```html
<a href="#content" class="skip-link">Skip to main content</a>
```
CSS: visually hidden by default, visible on `:focus`.

**Focus management in `nav.js`**: after `setOpen(false)`, call `navToggle.focus()`.

**ARIA live region**: `#music-now` already has `aria-live="polite"` in `index.html`. The `spotify.js` `setNow()` function updates its `textContent`, which triggers screen reader announcement.

**`noscript` fallback in `index.html`**:
```html
<noscript>
  <p style="color:white;text-align:center;padding:2rem">
    This portfolio uses JavaScript for interactive features. Core content is visible above.
  </p>
</noscript>
```

### 5. Error Handling Strategy

**WebGL detection (`src/error.js`)**:
```js
export function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')
    );
  } catch {
    return false;
  }
}
```
When `false`, `main.js` substitutes a no-op `experience` object and optionally shows a `<div class="webgl-fallback">` behind the content.

**Global error boundary (`src/error.js`)**:
```js
export function initErrorBoundary() {
  window.addEventListener('error', (e) => {
    console.error('[Portfolio error]', e.message, e.filename, e.lineno);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[Portfolio unhandled promise]', e.reason);
  });
}
```
In production this could be swapped for a real error tracking service by injecting an environment variable, but for a static personal site, console logging is sufficient.

**Spotify fallback (already exists, improved)**: The `try/catch` around `fetch('/api/spotify')` already falls back to `tracks.json`. The improvement is to log the error in dev and ensure `setLoading(false)` is called even on error so the UI doesn't hang in a loading state.

**JSON data validation**: `render.js` already calls `esc()` and `?? defaults` defensively. No additional validation needed beyond guarding against non-array inputs at the call site.

### 6. Security Headers

**`public/_headers`** (Netlify/Vercel):
```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://open.spotify.com; frame-src https://open.spotify.com; img-src 'self' https://cdn.simpleicons.org data:; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://api.spotify.com;
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Frame-Options: DENY
```

**Meta CSP fallback in `index.html`** (for non-Netlify/Vercel deploys):
```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self' https://open.spotify.com; …">
```

Note: `'unsafe-inline'` is required for styles because Google Fonts injects inline `<style>` elements. Inline scripts (the JSON-LD `<script type="application/ld+json">`) are not executable JS and do not require `script-src` exceptions.

### 7. Vitest Test Infrastructure

**`vitest.config.js`**:
```js
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: { provider: 'v8', threshold: { lines: 70, functions: 70 } },
    setupFiles: ['./src/tests/setup.js'],
  },
});
```

**`src/tests/setup.js`** — Three.js mock:
```js
vi.mock('three', () => ({
  Scene: vi.fn(), PerspectiveCamera: vi.fn(), WebGLRenderer: vi.fn(() => ({
    setSize: vi.fn(), setPixelRatio: vi.fn(), render: vi.fn(), getPixelRatio: vi.fn(() => 1), dispose: vi.fn(),
  })),
  // … other exports
}));
```

### 8. JSDoc Documentation Plan

All exported functions across the new modules get JSDoc:
- Parameter types (`@param {string} text`)
- Return types (`@returns {string}`)
- Brief description of purpose
- `@example` for complex functions (e.g., `initSpotify`)

Shader code in `scene.js` already has inline GLSL comments — keep as-is. The scroll calculation and Spotify pool logic get prose comments explaining the intent.

---

## Data Models

No new data models are introduced. Existing JSON structures remain unchanged:

**skills.json**: `Array<{ group: string, skills: Array<{ name: string, icon?: string, color?: string, level?: 1|2|3|4|5, size?: number, abbr?: string }> }>`

**projects.json**: `Array<{ tag?: string, title: string, description: string, tech: string[], link?: string }>`

**tracks.json**: `Array<{ id: string, type?: string, name?: string, artist?: string }>`

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

The feature is a mix of configuration changes, module reorganization, and pure function logic. The pure functions in `render.js` and the new utility functions are amenable to property-based testing. Infrastructure and DOM-interaction code is tested with examples and integration tests.

**Property Reflection**: After reviewing all acceptance criteria, the testable properties center on the pure markup-building functions in `render.js` and the `esc()` HTML-escaping utility. The JSON data validation requirement overlaps with the render function safety tests — these can be combined into comprehensive "render functions are safe for any input" properties rather than separate tests.

---

### Property 1: HTML escaping is safe for any string input

*For any* string value passed to `esc()`, the returned string must not contain any of the raw characters `<`, `>`, `&`, or `"` that were present in the input as literal characters — all such characters must appear as their HTML entity equivalents.

**Validates: Requirements 5.1, 8.7**

---

### Property 2: renderBubbles produces output containing all skill names

*For any* non-empty array of skill groups where each group has a non-empty `skills` array, `renderBubbles()` must return a string that contains the `name` field of every skill in every group.

**Validates: Requirements 5.1, 8.7**

---

### Property 3: renderProjects produces output containing all project titles

*For any* non-empty array of projects where each project has a `title` field, `renderProjects()` must return a string that contains every project's `title`.

**Validates: Requirements 5.1, 8.7**

---

### Property 4: Render functions do not throw for inputs with missing optional fields

*For any* skills array or projects array where some entries are missing optional fields (`icon`, `color`, `level`, `tag`, `link`, `tech`), calling `renderBubbles()` or `renderProjects()` respectively must not throw and must return a non-empty string.

**Validates: Requirements 8.7**

---

### Property 5: esc is idempotent for safe strings

*For any* string that contains no `<`, `>`, `&`, or `"` characters, applying `esc()` once and applying it twice must produce the same result.

**Validates: Requirements 5.1**

---

## Error Handling

| Scenario | Detection | Response |
|---|---|---|
| WebGL unavailable | `canvas.getContext()` returns null | Skip `createScene`, use no-op experience object; optionally show static background |
| Spotify API 4xx/5xx | `res.ok` is false | Fall back to `tracks.json` pool; log in dev |
| Spotify API network error | `fetch()` throws | Same fallback; `setLoading(false)` always called in `finally` |
| Spotify IFrame API script blocked | `window.onSpotifyIframeApiReady` never fires | `setLoading(false)` after timeout (5 s); hide player section |
| Simple Icons CDN failure | `<img>` `onerror` | Show `<span class="bubble__abbr">` fallback (already in markup) |
| JSON parse error | Unlikely (bundled at build time) | `renderBubbles([])`/`renderProjects([])` return empty strings gracefully |
| Runtime JS error | `window.onerror` | Log to console; page continues to function |
| Clipboard API unavailable | `navigator.clipboard.writeText` throws | `document.execCommand('copy')` textarea fallback (already implemented) |

---

## Testing Strategy

### Framework
**Vitest** with `jsdom` environment. No separate test runner needed — Vite already in devDeps.

### Test File Layout

| File | Tests |
|---|---|
| `src/tests/render.test.js` | Property tests for `esc`, `renderBubbles`, `renderProjects` using `fast-check` |
| `src/tests/nav.test.js` | Example tests: toggle state, focus return, outside-click close |
| `src/tests/spotify.test.js` | Example tests: fetch fallback, setNow, setPlayingState |
| `src/tests/interactions.test.js` | Example tests: copy email feedback, footer year |
| `src/tests/error.test.js` | Example tests: isWebGLAvailable with mocked canvas, error boundary registration |

### Property-Based Testing
Use **`fast-check`** for Property 1–5 above. Minimum 100 runs per property (fast-check default is 100).

Tag format for each property test: `// Feature: portfolio-best-practices-refactor, Property N: <description>`

### Unit Tests (Example-Based)
- nav: `setOpen(true)` → `aria-expanded="true"`, `setOpen(false)` → focus on toggle
- spotify: `fetch` rejects → pool remains as `tracks.json` data
- interactions: copy button gains `is-copied` class, reverts after 1600 ms
- error: `isWebGLAvailable()` returns `false` when `getContext` returns null

### Accessibility Tests
Use `axe-core` in one integration test that renders the full `index.html` in jsdom and asserts zero violations (with Three.js and Spotify mocked).

### Coverage Target
70% line/function coverage on `src/*.js` (excluding `scene.js` — Three.js GPU code is not meaningfully unit-testable without a real GPU).

### What is NOT tested with PBT
- `scene.js` — Three.js WebGL rendering requires GPU context; mock-based unit tests have low value for shader math
- CSS and visual layout — snapshot tests would be brittle; rely on manual review and axe-core
- Vite build output — deterministic, tested with single example builds
- External service behavior (Spotify IFrame API, Google Fonts, Simple Icons CDN) — integration only
