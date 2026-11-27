import { createPrint, PALETTE } from './print.js';
import { createRng, randomSeed, formatSeed } from './seed.js';
import {
  composeGarden,
  makeFlower,
  stepFlower,
  drawFlower,
  makeVine,
  stepVine,
  drawVine,
  makeBits,
  stepBits,
  drawBits,
} from './flowers.js';

/**
 * The halftone garden behind the page.
 *
 *  - A seeded arrangement of flowers blooms on load (same seed, same garden).
 *  - Click / tap anywhere that isn't a control to plant a flower; drag across
 *    the hero with a mouse or pen to draw a vine that buds as it goes.
 *  - Flowers live in viewport space on a fixed canvas: scrolling moves the
 *    print's lower edge up over them and they fade to a ghost print on paper.
 *  - Scrolling also lifts the two layers at their own pace (far slower than
 *    near, both slower than the page), so the print has depth. Flowers are
 *    stored in layer space; `nearY` turns a viewport y into it.
 *
 * Returns null when WebGL isn't available; the HTML page stands on its own.
 */

const INK = 3; // css px per ink-canvas px: low on purpose, it's what makes the print soft
const FAR = 5; // the far layer is drawn this much smaller again, then enlarged: out of focus
// Clicks on these do their own thing; everything else on the page is soil.
const NO_PLANT = 'a, button, input, textarea, select, summary, label, iframe, [tabindex], [data-no-plant]';
const PIXEL_BUDGET = 5.5e6; // drawing-buffer pixels we are willing to shade per frame
const FAR_RATE = 0.12; // how far each layer rises per px scrolled
const NEAR_RATE = 0.32;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

export function createGarden(canvas, { seed = randomSeed(), hero = null, root = document.body, reduceMotion = false, onReady } = {}) {
  const print = createPrint(canvas);
  if (!print) return null;

  const ink = document.createElement('canvas');
  const ictx = ink.getContext('2d', { alpha: false });
  const scratch = document.createElement('canvas');
  const sctx = scratch.getContext('2d', { alpha: false });

  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const MAX_FLOWERS = coarse ? 16 : 28;
  const MAX_BLOSSOMS = coarse ? 24 : 48;
  const MAX_VINES = 4;
  const wild = createRng(randomSeed()); // unseeded: whatever the visitor plants is theirs alone

  let w = 0;
  let h = 0;
  let dpr = 1;
  let budget = PIXEL_BUDGET;
  let t = 0;
  let flowers = [];
  let vines = [];
  let bits = [];
  let edge = 1e6; // viewport y where paper begins; far below the screen = all print
  let lift = 0; // px scrolled, as seen by the layers (0 with reduced motion)
  let playing = false;
  let playAmt = 0;
  let noiseSeed = 0;
  let dirty = true;
  let ready = false;
  const ptr = { x: -9999, y: -9999, vx: 0, vy: 0, stamp: 0, active: false, lens: 0 };
  const spot = { el: null, rect: [0, 0, 0, 0], amt: 0 };
  let press = null;

  // ---------- Size ----------
  function pickDpr() {
    return Math.max(0.75, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(budget / Math.max(1, w * h))));
  }

  function resize() {
    const nw = canvas.clientWidth || window.innerWidth;
    const nh = canvas.clientHeight || window.innerHeight;
    if (nw === w && nh === h) return;
    // Keep the arrangement where it was, proportionally. Small height changes
    // (mobile toolbars sliding away) are ignored so flowers don't twitch.
    const sx = w ? nw / w : 1;
    const sy = h && Math.abs(nh - h) / h > 0.15 ? nh / h : 1;
    if (sx !== 1 || sy !== 1) {
      for (const f of flowers) {
        f.x *= sx;
        f.y *= sy;
        if (f.stem) {
          f.stem.bx *= sx;
          f.stem.by *= sy;
          f.stem.cx *= sx;
          f.stem.cy *= sy;
        }
      }
      for (const v of vines) {
        for (const p of v.pts) {
          p.x *= sx;
          p.y *= sy;
        }
        for (const leaf of v.leaves) {
          leaf.x *= sx;
          leaf.y *= sy;
        }
      }
    }
    w = nw;
    h = nh;
    dpr = pickDpr();
    print.resize(w, h, dpr);
    ink.width = Math.ceil(w / INK);
    ink.height = Math.ceil(h / INK);
    scratch.width = Math.ceil(ink.width / FAR);
    scratch.height = Math.ceil(ink.height / FAR);
    dirty = true;
  }

  // ---------- Planting ----------
  const nearY = (y) => y + lift * NEAR_RATE;
  const layerY = (y, far) => y + lift * (far ? FAR_RATE : NEAR_RATE);

  const isBlossom = (f) => f.kind === 'blossom';

  function retire(list, max) {
    const alive = list.filter((f) => f.diedAt == null);
    for (let i = 0; i < alive.length - max; i++) alive[i].diedAt = t; // oldest first
  }

  function addFlower(f) {
    flowers.push(f);
    retire(flowers.filter((x) => isBlossom(x) === isBlossom(f)), isBlossom(f) ? MAX_BLOSSOMS : MAX_FLOWERS);
    dirty = true;
    return f;
  }

  function plantAt(x, y, { kind, size, stem = true } = {}) {
    const m = Math.min(w, h);
    return addFlower(
      makeFlower(wild, {
        kind: kind ?? (wild() < 0.6 ? 'lily' : 'cosmos'),
        x,
        y: nearY(y),
        size: size ?? clamp(m * (0.065 + wild() * 0.045), 40, 104),
        born: t,
        stem,
        showy: true,
      })
    );
  }

  function replant(nextSeed = randomSeed()) {
    seed = nextSeed & 0xffffff;
    const r = createRng(seed);
    const hadGarden = flowers.length > 0;
    for (const f of flowers) f.diedAt ??= t;
    for (const v of vines) v.diedAt ??= t;
    // Blooms open one after another; with reduced motion they are simply there.
    const start = reduceMotion ? t : t + (hadGarden ? 0.5 : 0.15);
    const stagger = reduceMotion ? 0 : 0.22;
    composeGarden(r, w, h).forEach((spec, i) => {
      flowers.push(makeFlower(r, { ...spec, y: layerY(spec.y, spec.far), born: start + i * stagger }));
    });
    noiseSeed = (seed % 997) * 0.173; // moves the cloudy ground too
    dirty = true;
    return seed;
  }

  // ---------- Vines ----------
  function startVine(x, y) {
    const v = makeVine(x, y, t);
    v.nextBud = 30 + wild() * 30;
    v.nextLeaf = 16 + wild() * 14;
    v.side = wild() < 0.5 ? 1 : -1;
    vines.push(v);
    retire(vines, MAX_VINES);
    for (const f of flowers) if (f.vine?.diedAt != null) f.diedAt ??= t;
    return v;
  }

  function extendVine(v, x, y) {
    const last = v.pts[v.pts.length - 1];
    const dx = x - last.x;
    const dy = y - last.y;
    const d = Math.hypot(dx, dy);
    if (d < 6 || v.length > 1800 || v.diedAt != null) return;
    v.pts.push({ x, y });
    v.length += d;
    const ux = dx / d;
    const uy = dy / d;
    if (v.length >= v.nextLeaf) {
      v.leafSide = -(v.leafSide ?? v.side);
      v.leaves.push({ x, y, angle: Math.atan2(uy, ux) + v.leafSide * (0.65 + wild() * 0.4), len: 20 + wild() * 16, born: t });
      v.nextLeaf = v.length + 30 + wild() * 34;
    }
    if (v.length >= v.nextBud) {
      v.side = -v.side;
      const off = 30 + wild() * 26;
      const f = makeFlower(wild, {
        kind: 'blossom',
        x: x - uy * off * v.side + ux * 10,
        y: y + ux * off * v.side + uy * 10,
        size: 22 + wild() * 13,
        born: t + 0.08,
        base: { x, y },
        showy: true,
      });
      f.vine = v;
      addFlower(f);
      v.nextBud = v.length + 70 + wild() * 60;
    }
    dirty = true;
  }

  // ---------- Pointer ----------
  function onPointerMove(e) {
    if (e.pointerType !== 'touch') {
      const now = performance.now();
      if (ptr.active) {
        const ms = Math.max(8, now - ptr.stamp);
        ptr.vx = lerp(ptr.vx, ((e.clientX - ptr.x) / ms) * 1000, 0.5);
        ptr.vy = lerp(ptr.vy, ((e.clientY - ptr.y) / ms) * 1000, 0.5);
      }
      ptr.x = e.clientX;
      ptr.y = e.clientY;
      ptr.stamp = now;
      ptr.active = true;
    }
    if (press && e.pointerId === press.id) {
      if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) {
        press.moved = true;
        if (press.canVine) press.vine = startVine(press.x, nearY(press.y));
      }
      if (press.vine) extendVine(press.vine, e.clientX, nearY(e.clientY));
    }
  }

  function onPointerDown(e) {
    if (!e.isPrimary || e.button !== 0) return;
    const el = e.target;
    if (!(el instanceof Element) || !root.contains(el) || el.closest(NO_PLANT)) return;
    press = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      // Touch drags scroll the page, so vines are for mouse and pen, and only on the hero.
      canVine: e.pointerType !== 'touch' && !!hero?.contains(el),
      vine: null,
    };
  }

  function onPointerUp(e) {
    if (!press || e.pointerId !== press.id) return;
    const selecting = window.getSelection && !window.getSelection().isCollapsed;
    if (!press.moved && !selecting) plantAt(e.clientX, e.clientY);
    press = null;
  }

  const onPointerCancel = () => (press = null);
  const onPointerLeave = () => (ptr.active = false);

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
  document.documentElement.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('blur', onPointerLeave);

  // ---------- Simulation ----------
  function step(dt) {
    t += dt;
    playAmt += ((playing ? 1 : 0) - playAmt) * Math.min(1, dt * 2.5);
    const pulse = Math.pow(Math.max(0, Math.sin(t * Math.PI * 3.4)), 4);
    const env = {
      t,
      still: reduceMotion,
      beat: playAmt * (0.35 + 0.65 * pulse),
      pointer: ptr.active,
      px: ptr.x,
      py: nearY(ptr.y),
      pvx: ptr.vx,
      pvy: ptr.vy,
    };
    for (const f of flowers) {
      const fresh = f.fresh;
      stepFlower(f, dt, env);
      if (fresh !== f.fresh) dirty = true; // ink fading on paper is the one change still shown with reduced motion
    }
    for (const v of vines) stepVine(v, env);
    const before = flowers.length + vines.length + bits.length;
    flowers = flowers.filter((f) => f.dying < 1);
    vines = vines.filter((v) => v.dying < 1);
    bits = stepBits(bits, dt);
    if (before !== flowers.length + vines.length + bits.length || bits.length) dirty = true;

    const decay = Math.exp(-dt * 6);
    ptr.vx *= decay;
    ptr.vy *= decay;
    ptr.lens += ((ptr.active && !reduceMotion ? 1 : 0) - ptr.lens) * Math.min(1, dt * 5);

    if (spot.el?.isConnected) {
      const b = spot.el.getBoundingClientRect();
      spot.rect = [b.left, b.top, b.right, b.bottom];
    } else {
      spot.el = null;
    }
    const target = spot.el ? 1 : 0;
    if (spot.amt !== target) {
      spot.amt = reduceMotion ? target : clamp(spot.amt + Math.sign(target - spot.amt) * dt * 3.2);
      dirty = true;
    }
  }

  // ---------- Drawing ----------
  function drawInk() {
    const k = 1 / INK;
    sctx.fillStyle = '#000';
    sctx.fillRect(0, 0, scratch.width, scratch.height);
    let anyFar = false;
    sctx.save();
    sctx.translate(0, (-lift * FAR_RATE * k) / FAR);
    for (const f of flowers) {
      if (!f.far) continue;
      drawFlower(sctx, f, k / FAR);
      anyFar = true;
    }
    sctx.restore();
    ictx.fillStyle = '#000';
    ictx.fillRect(0, 0, ink.width, ink.height);
    if (anyFar) {
      ictx.imageSmoothingEnabled = true;
      ictx.imageSmoothingQuality = 'high';
      ictx.drawImage(scratch, 0, 0, scratch.width * FAR, scratch.height * FAR);
    }
    ictx.save();
    ictx.translate(0, -lift * NEAR_RATE * k);
    for (const v of vines) drawVine(ictx, v, k);
    for (const f of flowers) if (!f.far) drawFlower(ictx, f, k);
    ictx.restore();
    drawBits(ictx, bits, k); // loose petals live in viewport space
  }

  function frameUniforms() {
    const paper = clamp(1 - edge / h); // 0 while the hero fills the screen, 1 once it has scrolled away
    return {
      inkView: [ink.width * INK, ink.height * INK],
      pitch: clamp(w / 230, 4.6, 6.6),
      edge,
      band: h * 0.14,
      pointer: [ptr.x, ptr.y, ptr.lens * lerp(1, 0.5, paper)],
      spot: spot.rect,
      spotAmt: spot.amt,
      seed: noiseSeed,
    };
  }

  function render() {
    drawInk();
    print.render(ink, frameUniforms());
    dirty = false;
    if (!ready) {
      ready = true;
      onReady?.();
    }
  }

  // ---------- Loop ----------
  let rafId = 0;
  let running = false;
  let last = 0;
  let pending = 0;
  let frames = 0;
  let avgFrame = 1 / 60;
  let downgrades = 2;

  // If we can't hold a decent frame rate, shade fewer pixels (never step back up).
  function watchPerformance(rawDt) {
    if (++frames < 90 || !downgrades || rawDt > 0.25) return;
    avgFrame += (rawDt - avgFrame) * 0.05;
    if (frames % 60 || avgFrame < 1 / 40) return;
    downgrades--;
    budget *= 0.55;
    const next = pickDpr();
    if (next < dpr) {
      dpr = next;
      print.resize(w, h, dpr);
      dirty = true;
    }
    avgFrame = 1 / 60;
  }

  function tick(now) {
    if (!running) return;
    rafId = requestAnimationFrame(tick);
    const rawDt = (now - last) / 1000;
    last = now;
    watchPerformance(rawDt);
    pending += Math.min(rawDt, 0.1);
    // Once the hero has scrolled away the garden is only a backdrop: 30fps is plenty.
    const backdrop = edge <= 0 && !bits.length && spot.amt === 0;
    if (backdrop && pending < 1 / 31) return;
    const dt = Math.min(pending, 0.05);
    pending = 0;
    step(dt);
    // With reduced motion nothing moves by itself, so only redraw on change.
    if (!reduceMotion || dirty) render();
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVisibility);

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  window.addEventListener('resize', resize);

  resize();
  replant(seed);
  step(0);
  render(); // paint a first frame now so the page never shows an empty canvas
  if (!document.hidden) start();

  // ---------- Public API ----------
  return {
    get seed() {
      return seed;
    },
    plantAt,
    /** Lets the current garden drop its petals and grows a new one. Returns the new seed. */
    replant,
    /** edgeY: viewport y (css px) where the print ends and cream paper begins. */
    setPaper(edgeY) {
      if (edgeY === edge) return;
      edge = edgeY;
      dirty = true;
    },
    /** scrollY: page scroll in css px; lifts the layers for depth. */
    setScroll(scrollY) {
      if (reduceMotion) return;
      const next = clamp(scrollY, 0, h * 1.5);
      if (next === lift) return;
      lift = next;
      dirty = true;
    },
    /** Print this element's box back in full ink (pass null to let it fade to paper). */
    spotlight(el) {
      spot.el = el;
    },
    setPlaying(on) {
      playing = on;
    },
    /** A puff of loose red petals. */
    burst(x, y, count = 16) {
      if (reduceMotion) return;
      bits.push(...makeBits(wild, x, y, count));
    },
    /** The garden as it stands, framed as a print with name and edition. Resolves to a PNG Blob. */
    savePoster({ title = 'A garden, printed.', credit = '' } = {}) {
      const scrolled = lift;
      lift = 0; // the poster is the whole arrangement, as planted
      drawInk();
      lift = scrolled;
      print.render(ink, { ...frameUniforms(), edge: 1e6, pointer: [0, 0, 0], spotAmt: 0 });
      dirty = true;
      const gw = canvas.width;
      const gh = canvas.height;
      const margin = Math.round(gw * 0.045);
      const foot = Math.round(clamp(gw * 0.1, 96, 220));
      const out = document.createElement('canvas');
      out.width = gw + margin * 2;
      out.height = gh + margin + foot;
      const c = out.getContext('2d');
      c.fillStyle = PALETTE.cream;
      c.fillRect(0, 0, out.width, out.height);
      c.drawImage(canvas, margin, margin); // same task as the render, so the buffer is still there
      c.fillStyle = PALETTE.navy;
      c.textBaseline = 'middle';
      const mid = gh + margin + foot / 2;
      c.font = `italic 400 ${Math.round(foot * 0.3)}px Fraunces, Georgia, serif`;
      c.fillText(title, margin, mid);
      c.textAlign = 'right';
      c.font = `500 ${Math.round(foot * 0.125)}px "JetBrains Mono", ui-monospace, monospace`;
      const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const right = out.width - margin;
      if (credit) c.fillText(credit.toUpperCase(), right, mid - foot * 0.12);
      c.fillText(`EDITION № ${formatSeed(seed)} · ${date.toUpperCase()}`, right, mid + (credit ? foot * 0.12 : 0));
      return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
    },
    dispose() {
      stop();
      observer.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('blur', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      print.dispose();
    },
  };
}
