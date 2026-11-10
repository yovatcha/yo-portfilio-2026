# Implementation Plan: Portfolio Best Practices Refactor

## Overview

Incremental refactoring of the Three.js portfolio. Each task is self-contained and leaves the site fully functional. Tasks are ordered to give early test coverage before the module split, so every extraction step is immediately validated.

Language: **JavaScript (ES modules)** — matching existing codebase. Test framework: **Vitest** + **fast-check** for property tests.

---

## Tasks

- [ ] 1. Install dev dependencies and configure tooling
  - Add to `devDependencies` in `package.json`: `vitest`, `@vitest/coverage-v8`, `fast-check`, `jsdom`, `axe-core`, `eslint`, `@eslint/js`, `eslint-plugin-unicorn`, `prettier`, `lint-staged`, `husky`, `rollup-plugin-visualizer`
  - Create `vitest.config.js` with jsdom environment, globals enabled, coverage threshold of 70%, and `src/tests/setup.js` as setupFiles
  - Create `src/tests/setup.js` with a `vi.mock('three', …)` stub that replaces WebGLRenderer, Scene, PerspectiveCamera, Clock, and Three.js geometry/material classes with vi.fn() factories
  - Create `.eslintrc.js` (flat config) with `eslint.configs.recommended` and unicorn plugin; enable `unicorn/prefer-string-replace-all` and `no-nested-ternary`
  - Create `.prettierrc` with `{ "singleQuote": true, "trailingComma": "es5", "printWidth": 100 }`
  - Add `"test": "vitest --run"`, `"test:coverage": "vitest --run --coverage"`, `"lint": "eslint src/"`, `"format": "prettier --write src/ index.html"` scripts to `package.json`
  - Add `"lint-staged"` config to `package.json` targeting `src/**/*.{js,json}` → eslint --fix + prettier --write, and `*.{html,css}` → prettier --write
  - Run `npx husky init` and write `npx lint-staged` to `.husky/pre-commit`
  - _Requirements: 1.1, 1.2, 1.4, 5.1, 9.1_

- [ ] 2. Write property and unit tests for render.js (before any refactoring)
  - [ ] 2.1 Create `src/tests/render.test.js`
    - Import `{ esc, renderBubbles, renderProjects }` from `../../render.js`
    - _Requirements: 5.1_

  - [ ]* 2.2 Write property test for esc() safety — Property 1
    - Use `fc.string()` arbitrary; assert output never contains raw `<`, `>`, `&`, or `"` characters
    - Comment: `// Feature: portfolio-best-practices-refactor, Property 1: HTML escaping is safe for any string input`
    - Run 100 iterations minimum (fast-check default)
    - **Property 1: HTML escaping is safe for any string input**
    - **Validates: Requirements 5.1, 8.7**

  - [ ]* 2.3 Write property test for esc() idempotence — Property 5
    - Use `fc.string()` filtered to strings without `<>&"` (safe strings); assert `esc(s) === esc(esc(s))`
    - Comment: `// Feature: portfolio-best-practices-refactor, Property 5: esc is idempotent for safe strings`
    - **Property 5: esc is idempotent for safe strings**
    - **Validates: Requirements 5.1**

  - [ ]* 2.4 Write property test for renderBubbles completeness — Property 2
    - Use `fc.array(fc.record({ group: fc.string({minLength:1}), skills: fc.array(fc.record({ name: fc.string({minLength:1}) }), {minLength:1}) }), {minLength:1})` arbitrary
    - Assert the output string contains every skill name
    - Comment: `// Feature: portfolio-best-practices-refactor, Property 2: renderBubbles produces output containing all skill names`
    - **Property 2: renderBubbles produces output containing all skill names**
    - **Validates: Requirements 5.1, 8.7**

  - [ ]* 2.5 Write property test for renderProjects completeness — Property 3
    - Use `fc.array(fc.record({ title: fc.string({minLength:1}) }), {minLength:1})` arbitrary
    - Assert output contains every project title
    - Comment: `// Feature: portfolio-best-practices-refactor, Property 3: renderProjects produces output containing all project titles`
    - **Property 3: renderProjects produces output containing all project titles**
    - **Validates: Requirements 5.1, 8.7**

  - [ ]* 2.6 Write property test for render functions with missing optional fields — Property 4
    - Use partial record arbitraries (omitting `icon`, `color`, `level`, `tag`, `link`, `tech`); assert neither function throws and both return non-empty strings
    - Comment: `// Feature: portfolio-best-practices-refactor, Property 4: Render functions do not throw for inputs with missing optional fields`
    - **Property 4: Render functions do not throw for inputs with missing optional fields**
    - **Validates: Requirements 8.7**

- [ ] 3. Checkpoint — run tests, ensure all pass
  - Run `npm test` and confirm all property tests pass before proceeding.
  - Ask the user if questions arise before continuing.

- [ ] 4. Extract `src/error.js` — WebGL detection and error boundary
  - Create `src/error.js` with two exported functions:
    - `isWebGLAvailable()`: tries `canvas.getContext('webgl2')`, falls back to `webgl`, returns boolean; wraps in try/catch
    - `initErrorBoundary()`: registers `window.addEventListener('error', …)` and `window.addEventListener('unhandledrejection', …)` that call `console.error` with a `[Portfolio error]` prefix
  - Add JSDoc `@param`, `@returns`, and `@description` to both functions
  - Do NOT modify `main.js` yet (wire-up happens in task 9)
  - _Requirements: 7.1, 8.1, 8.3, 11.6_

  - [ ]* 4.1 Write unit tests for `src/error.js` in `src/tests/error.test.js`
    - Test `isWebGLAvailable()` returns `false` when `document.createElement('canvas').getContext` returns `null` (mock via `vi.spyOn`)
    - Test `isWebGLAvailable()` returns `true` when `getContext` returns a truthy object
    - Test `initErrorBoundary()` attaches an `error` listener to `window` (assert with `vi.spyOn(window, 'addEventListener')`)
    - _Requirements: 8.1, 8.3_

- [ ] 5. Extract `src/nav.js` — mobile navigation
  - Create `src/nav.js` exporting `initNav({ nav, navToggle, navMenu })`:
    - Copy the nav toggle block from `main.js` (lines ~22–40) verbatim
    - In `setOpen(false)`, add `navToggle.focus()` after updating classes/attributes
    - Add JSDoc to the exported function
  - Do NOT modify `main.js` yet
  - _Requirements: 3.2, 7.1, 7.4, 11.6_

  - [ ]* 5.1 Write unit tests for `src/nav.js` in `src/tests/nav.test.js`
    - Set up a minimal DOM with nav, navToggle (button), and navMenu elements using jsdom
    - Test `setOpen(true)` sets `nav.classList` contains `is-open` and `aria-expanded="true"` on toggle
    - Test `setOpen(false)` removes `is-open` and calls `navToggle.focus()` (assert with `vi.spyOn`)
    - Test clicking a link inside `navMenu` calls `setOpen(false)`
    - _Requirements: 3.2, 7.1_

- [ ] 6. Extract `src/scroll.js` — scroll and reveal
  - Create `src/scroll.js` exporting:
    - `initScroll(experience)`: copies `updateScroll` + its `scroll`/`resize` listeners from `main.js`
    - `initReveal()`: copies the `IntersectionObserver` block from `main.js`
  - Add JSDoc to both exports
  - Do NOT modify `main.js` yet
  - _Requirements: 7.1, 7.4, 11.6_

- [ ] 7. Extract `src/interactions.js` — tilt, copy-email, footer year
  - Create `src/interactions.js` exporting:
    - `initTilt(aboutPhoto)`: copies the about-portrait 3D tilt block from `main.js`
    - `initCopyEmail(copyBtn, emailLink)`: copies the copy-email block from `main.js`; replace deprecated `document.execCommand` fallback comment with a note that it exists for legacy browsers
    - `initFooterYear(yearEl)`: one-liner, `yearEl.textContent = new Date().getFullYear()`
  - Add JSDoc to all three exports
  - Do NOT modify `main.js` yet
  - _Requirements: 7.1, 7.4, 11.6_

  - [ ]* 7.1 Write unit tests for `src/interactions.js` in `src/tests/interactions.test.js`
    - Test `initCopyEmail`: mock `navigator.clipboard.writeText`, click `copyBtn`, assert `is-copied` class is added and label changes to `'Copied!'`
    - Test `initCopyEmail`: after 1600 ms (use `vi.useFakeTimers`), assert `is-copied` class is removed
    - Test `initFooterYear`: assert `yearEl.textContent` equals `String(new Date().getFullYear())`
    - _Requirements: 7.1_

- [ ] 8. Extract `src/spotify.js` — Spotify IFrame player
  - Create `src/spotify.js` exporting `initSpotify(els, fallbackTracks)`:
    - Copy the entire Spotify player block from `main.js` (lines ~60–140)
    - Ensure `setLoading(false)` is called in a `finally` block on the fetch so the UI never hangs
    - Export the `pickRandom` helper as a named export for testability
    - Add JSDoc with `@param` describing both parameters
  - Do NOT modify `main.js` yet
  - _Requirements: 7.1, 7.4, 7.7, 8.2, 11.6_

  - [ ]* 8.1 Write unit tests for `src/spotify.js` in `src/tests/spotify.test.js`
    - Test fetch fallback: mock `global.fetch` to reject; assert `pickRandom()` still works (pool has entries from fallbackTracks)
    - Test `setNow`: assert `nowEl.textContent` is updated to `'🎵 Track Name — Artist'` format when track has name/artist
    - Test `setNow` with no name: assert `nowEl.textContent` is empty string
    - _Requirements: 8.2_

- [ ] 9. Wire new modules into `main.js`
  - Replace the body of `main.js` with imports from the new modules and a concise wiring block (~30 lines):
    - Import and call `initErrorBoundary()` first
    - Check `isWebGLAvailable()` before calling `createScene`; if unavailable, use `{ setScroll: () => {}, dispose: () => {} }`
    - Import and call `initNav`, `initScroll`, `initReveal`, `initSpotify`, `initTilt`, `initCopyEmail`, `initFooterYear`
    - Keep the bubbles/projects `innerHTML` rendering inline (it's 4 lines)
    - Keep the loader-hide `window.load` listener inline
  - Verify `vite dev` still works and all interactive features function correctly
  - _Requirements: 7.1, 7.2, 7.4, 8.1, 8.3_

- [ ] 10. Checkpoint — run full test suite and manual smoke test
  - Run `npm test` — all tests must pass
  - Run `npm run dev` and manually verify: nav toggle, Spotify player, scroll animations, tilt effect, copy email, project cards render
  - Ask the user if questions arise before continuing.

- [ ] 11. Update `vite.config.js` — code splitting, sourcemaps, bundle analyzer
  - Add `manualChunks: { three: ['three'] }` inside `build.rollupOptions.output` to split Three.js into its own chunk
  - Set `sourcemap: process.env.NODE_ENV !== 'production'` (or use Vite's `mode` parameter)
  - Add `rollup-plugin-visualizer` to the plugins array: `visualizer({ open: false, filename: 'dist/stats.html', gzipSize: true })`; wrap in a condition so it only runs when `process.env.ANALYZE === 'true'`
  - Verify the prerender plugin still works: run `npm run build` and check `dist/index.html` contains pre-rendered project cards and skill bubbles
  - _Requirements: 2.3, 2.4, 6.2_

- [ ] 12. Add security headers
  - Create `public/_headers` (the file goes into `src/public/` so Vite copies it to `dist/`):
    ```
    /*
      Content-Security-Policy: default-src 'self'; script-src 'self' https://open.spotify.com; frame-src https://open.spotify.com; img-src 'self' https://cdn.simpleicons.org data:; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; connect-src 'self';
      X-Content-Type-Options: nosniff
      Referrer-Policy: strict-origin-when-cross-origin
      Permissions-Policy: camera=(), microphone=(), geolocation=()
      X-Frame-Options: DENY
    ```
  - Add a `<meta http-equiv="Content-Security-Policy">` tag to `index.html` `<head>` with the same policy (fallback for non-Netlify/Vercel deploys)
  - _Requirements: 4.1, 4.3, 4.4, 4.5_

- [ ] 13. Add accessibility improvements to `index.html`
  - Add a skip-to-content link as the very first element inside `<body>`:
    ```html
    <a href="#content" class="skip-link">Skip to main content</a>
    ```
  - Add CSS for `.skip-link` in `style.css`: visually hidden by default (`position: absolute; left: -9999px`), visible and styled on `:focus` (position fixed, top, left, background, color, padding, z-index)
  - Add `<noscript>` tag after the loader div with a brief message that the portfolio uses JavaScript and that content is visible in the HTML
  - Verify `#music-now` already has `aria-live="polite"` (it does) — no change needed
  - _Requirements: 3.3, 3.6, 13.3_

- [ ] 14. Add JSDoc to all public module APIs
  - Add `@param`, `@returns`, and a one-sentence `@description` to all exported functions in: `render.js`, `nav.js`, `scroll.js`, `spotify.js`, `interactions.js`, `error.js`, `scene.js`
  - For `scene.js`, add `@returns {{ setScroll: function, dispose: function }}` to `createScene`
  - Do not add JSDoc to `main.js` (it's an entry point, not a library)
  - _Requirements: 7.6, 11.6_

- [ ] 15. Final checkpoint — lint, tests, build
  - Run `npm run lint` — confirm no errors (warnings for `Math.random` in `scene.js` are acceptable; suppress with `// eslint-disable-next-line` if needed in non-crypto contexts)
  - Run `npm run format` — confirm no formatting diffs
  - Run `npm test` — all tests pass
  - Run `npm run build` — build succeeds, `dist/index.html` contains pre-rendered content, no `.map` files present in dist
  - Verify `dist/` contains a separate `three-*.js` chunk confirming code splitting worked
  - Ask the user if questions arise before finishing.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["3"] },
    { "wave": 4, "tasks": ["4", "5", "6", "7", "8"] },
    { "wave": 5, "tasks": ["9"] },
    { "wave": 6, "tasks": ["10"] },
    { "wave": 7, "tasks": ["11", "12", "13", "14"] },
    { "wave": 8, "tasks": ["15"] }
  ]
}
```

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- The prerender plugin is validated in tasks 9, 11, and 15 — any module split that breaks it will be caught early
- Three.js is always mocked in tests via `src/tests/setup.js` — no WebGL context needed
- The `_headers` file must go into `src/public/` (the Vite `publicDir`) so it gets copied to `dist/` on build
- Code splitting in task 11 does not change runtime behavior — Three.js loads on demand via dynamic import semantics handled by the browser
- Running `ANALYZE=true npm run build` opens `dist/stats.html` in a browser to inspect bundle composition
