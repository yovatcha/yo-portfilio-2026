// Flower models for the halftone garden, drawn with Canvas2D into the small
// "ink" canvas that print.js then screens into halftone dots.
//
// The ink canvas is not a picture, it is a set of printing plates:
//   red channel   = how much light ink (0 = bare navy, 1 = solid cream)
//   green channel = the red-ink plate (stamens, flower eyes, loose petals)
//   blue channel  = "fresh ink": 1 while a flower has just opened, fading to
//                   0. On paper, fresh ink prints strong instead of as a ghost.
//
// Everything here works in CSS pixels; `k` scales them to canvas pixels, so
// the same flower can be drawn sharp (near layer) or tiny-then-enlarged
// (far layer, out of focus).

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => x * x * (3 - 2 * x);

const lum = (v, a = 1, fresh = 0) => `rgba(${Math.round(clamp(v) * 255)},0,${Math.round(clamp(fresh) * 255)},${a})`;
const redInk = (a = 1, fresh = 0) => `rgba(70,255,${Math.round(clamp(fresh) * 255)},${a})`;

const FRESH_HOLD = 2.5; // seconds a newly opened flower stays in strong ink on paper…
const FRESH_FADE = 3.5; // …and how long it then takes to fade to a ghost

const KINDS = {
  // six pointed petals seen at an angle, like the lilies in the reference print
  lily: { petals: 6, wid: [0.27, 0.35], tilt: [0.55, 0.92], dur: 2.3 },
  // eight notched petals, nearly face-on
  cosmos: { petals: 8, wid: [0.17, 0.21], tilt: [0.82, 1], dur: 1.9 },
  // small five-petal flowers that open along a vine
  blossom: { petals: 5, wid: [0.3, 0.36], tilt: [0.85, 1], dur: 1.3 },
};

// Petal outline from its base at the origin, pointing up (−y). `curl` swings
// the tip sideways so lily petals don't look stamped out.
function petalPath(ctx, kind, len, wid, curl = 0) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  if (kind === 'lily') {
    const tip = curl * len * 0.16;
    ctx.bezierCurveTo(wid * 1.25, -len * 0.3, wid * 0.8 + tip, -len * 0.78, tip, -len);
    ctx.bezierCurveTo(-wid * 0.8 + tip, -len * 0.78, -wid * 1.25, -len * 0.3, 0, 0);
  } else if (kind === 'cosmos') {
    ctx.bezierCurveTo(wid * 0.5, -len * 0.3, wid * 1.3, -len * 0.75, wid * 0.55, -len * 0.98);
    ctx.lineTo(0, -len * 0.9);
    ctx.lineTo(-wid * 0.55, -len * 0.98);
    ctx.bezierCurveTo(-wid * 1.3, -len * 0.75, -wid * 0.5, -len * 0.3, 0, 0);
  } else {
    ctx.bezierCurveTo(wid * 1.5, -len * 0.25, wid * 1.3, -len, 0, -len);
    ctx.bezierCurveTo(-wid * 1.3, -len, -wid * 1.5, -len * 0.25, 0, 0);
  }
  ctx.closePath();
}

function drawLeaf(ctx, x, y, angle, len, value, alpha) {
  if (len < 0.8) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 2);
  petalPath(ctx, 'lily', len, len * 0.24);
  ctx.fillStyle = lum(value, alpha);
  ctx.fill();
  ctx.restore();
}

/**
 * @param {() => number} r   random source (seeded for the opening garden)
 * @param {object} spec      { kind, x, y, size, far, born, base, stem, showy }
 *   x/y is where the bloom ends up; `size` is the petal length; `base` pins
 *   the foot of the stem (used by vines); `far` puts it in the blurred layer;
 *   `showy` flowers print in fresh ink when they open over paper.
 */
export function makeFlower(r, { kind = 'lily', x, y, size, far = false, born = 0, base = null, stem = true, showy = false }) {
  const K = KINDS[kind];
  const petals = [];
  for (let i = 0; i < K.petals; i++) {
    const inner = kind === 'lily' && i % 2 === 1;
    let a = (i / K.petals) * TAU + (r() - 0.5) * 0.16;
    if (a > Math.PI) a -= TAU; // so `a * open` folds every petal toward the bud's axis
    petals.push({
      a,
      len: (inner ? 0.9 : 1) * (0.92 + r() * 0.12),
      wid: lerp(K.wid[0], K.wid[1], r()),
      curl: (r() - 0.5) * 2,
      back: kind === 'lily' && !inner,
      fall: { dx: (r() - 0.5) * 2, speed: 0.7 + r() * 0.8, spin: (r() - 0.5) * 2 },
    });
  }
  petals.sort((p, q) => Number(q.back) - Number(p.back));

  let stemSpec = null;
  const leaves = [];
  if (stem) {
    let bx;
    let by;
    if (base) {
      bx = base.x;
      by = base.y;
    } else {
      // No ground in this picture: stems trail off downward and fade, like a cropped photo.
      const angle = Math.PI / 2 + (r() - 0.5) * 1.5;
      const length = size * (2.1 + r() * 1.3);
      bx = x + Math.cos(angle) * length;
      by = y + Math.sin(angle) * length;
    }
    const bend = (r() - 0.5) * 0.5;
    stemSpec = {
      bx,
      by,
      cx: (x + bx) / 2 - (y - by) * bend,
      cy: (y + by) / 2 + (x - bx) * bend,
      pinned: !!base,
    };
    if (kind !== 'blossom') {
      const count = r() < 0.3 ? 0 : r() < 0.55 ? 1 : 2;
      for (let i = 0; i < count; i++) {
        leaves.push({ t: 0.28 + r() * 0.42, side: i % 2 ? 1 : -1, len: 0.5 + r() * 0.4 });
      }
    }
  }

  return {
    kind,
    x,
    y,
    size,
    far,
    showy,
    fresh: 0,
    born,
    dur: K.dur * clamp(size / 120, 0.6, 1.15),
    rot: r() * TAU, // used when there is no stem to take a direction from
    turn: (r() - 0.5) * 1.7, // how far the open bloom twists away from its stem
    tilt: lerp(K.tilt[0], K.tilt[1], r()),
    lumK: far ? 0.5 + r() * 0.12 : 1,
    petals,
    stem: stemSpec,
    leaves,
    phase: r() * TAU,
    growth: 0,
    diedAt: null,
    dying: 0,
    ox: 0,
    oy: 0,
    vx: 0,
    vy: 0,
  };
}

/**
 * Advance growth, petal fall and sway.
 * env: { t, still, beat, pointer, px, py, pvx, pvy }
 */
export function stepFlower(f, dt, env) {
  f.growth = env.still ? (env.t >= f.born ? 1 : 0) : clamp((env.t - f.born) / f.dur);
  if (f.diedAt != null) f.dying = env.still ? 1 : clamp((env.t - f.diedAt) / 1.4);
  f.fresh = f.showy ? 1 - clamp((env.t - f.born - f.dur - FRESH_HOLD) / FRESH_FADE) : 0;
  if (env.still) return;

  // Ambient breeze, wider and bouncing while music plays.
  const amp = f.size * (f.far ? 0.03 : 0.05) * (1 + env.beat * 1.8);
  let tx = Math.sin(env.t * 0.7 + f.phase) * amp + Math.sin(env.t * 1.83 + f.phase * 2.1) * amp * 0.35;
  let ty = Math.cos(env.t * 0.9 + f.phase) * amp * 0.3 - env.beat * f.size * 0.05;

  // Near blooms lean toward the pointer and get brushed aside when it rushes past.
  if (env.pointer && !f.far) {
    const dx = env.px - f.x;
    const dy = env.py - f.y;
    const d = Math.hypot(dx, dy) || 1;
    const reach = 170 + f.size;
    const fall = Math.exp(-(d * d) / (reach * reach));
    const lean = Math.min(d, f.size * 0.45);
    tx += ((dx / d) * lean + clamp(env.pvx * 0.05, -42, 42)) * fall;
    ty += ((dy / d) * lean + clamp(env.pvy * 0.05, -42, 42)) * fall;
  }

  // Slightly under-damped spring, so a nudge leaves the bloom nodding.
  f.vx += ((tx - f.ox) * 46 - f.vx * 7.5) * dt;
  f.vy += ((ty - f.oy) * 46 - f.vy * 7.5) * dt;
  f.ox += f.vx * dt;
  f.oy += f.vy * dt;
}

export function drawFlower(ctx, f, k) {
  const g = f.growth;
  if (g <= 0 || f.dying >= 1) return;
  const die = f.dying;
  const alive = 1 - die;
  const fresh = f.fresh;
  const L = f.size * k;
  const reach = smooth(clamp(g / 0.5)); // the stem climbs first…
  const open = smooth(clamp((g - 0.38) / 0.62)); // …then the bud at its tip opens
  const tx = (f.x + f.ox) * k;
  const ty = (f.y + f.oy) * k;
  let hx = tx;
  let hy = ty;
  let budRot = f.rot;

  if (f.stem) {
    const bx = f.stem.bx * k;
    const by = f.stem.by * k;
    const cx = (f.stem.cx + f.ox * 0.5) * k;
    const cy = (f.stem.cy + f.oy * 0.5) * k;
    // De Casteljau: the part of the curve grown so far is itself a quadratic.
    const c1x = lerp(bx, cx, reach);
    const c1y = lerp(by, cy, reach);
    hx = lerp(c1x, lerp(cx, tx, reach), reach);
    hy = lerp(c1y, lerp(cy, ty, reach), reach);
    budRot = Math.atan2(hy - c1y, hx - c1x) + Math.PI / 2;

    const value = 0.5 * f.lumK; // brighter than it prints: the press softens thin lines
    const grad = ctx.createLinearGradient(bx, by, hx, hy);
    grad.addColorStop(0, lum(value, f.stem.pinned ? alive : 0));
    grad.addColorStop(f.stem.pinned ? 0.05 : 0.42, lum(value, alive));
    grad.addColorStop(1, lum(value, alive));
    ctx.strokeStyle = grad;
    ctx.lineWidth = Math.max(1.1, L * 0.05);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(c1x, c1y, hx, hy);
    ctx.stroke();

    for (const leaf of f.leaves) {
      if (reach <= leaf.t) continue;
      const u = leaf.t;
      const lx = (1 - u) * (1 - u) * bx + 2 * (1 - u) * u * cx + u * u * tx;
      const ly = (1 - u) * (1 - u) * by + 2 * (1 - u) * u * cy + u * u * ty;
      const dir = Math.atan2((1 - u) * (cy - by) + u * (ty - cy), (1 - u) * (cx - bx) + u * (tx - cx));
      const grown = smooth(clamp((reach - u) / 0.35));
      drawLeaf(ctx, lx, ly, dir + leaf.side * 0.8, leaf.len * L * grown, 0.4 * f.lumK, alive);
    }
  }

  const rot = budRot + f.turn * open;
  const tilt = lerp(1, f.tilt, open);
  const lenK = 0.3 * smooth(clamp(g / 0.38)) + 0.7 * open;

  // Sharp blooms catch the light: a soft halo that prints as a fringe of blue dots.
  if (!f.far && open > 0.02) {
    const glow = ctx.createRadialGradient(hx, hy, L * 0.2, hx, hy, L * 1.4);
    glow.addColorStop(0, lum(0.3 * open * alive));
    glow.addColorStop(1, lum(0));
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(hx, hy, L * 1.4, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  for (const p of f.petals) {
    const len = p.len * L * lenK;
    if (len < 0.6) continue;
    const wid = p.wid * len * lerp(1.3, 1, open); // a closed bud is plump
    ctx.save();
    if (die > 0) {
      // petals let go one by one and drift down
      ctx.translate(hx + p.fall.dx * die * L * 0.9, hy + die * die * L * 2.2 * p.fall.speed);
      ctx.rotate(rot + p.fall.spin * die * 2.4);
      ctx.globalAlpha = 1 - die * die;
    } else {
      ctx.translate(hx, hy);
      ctx.rotate(rot);
    }
    ctx.scale(1, tilt);
    ctx.rotate(p.a * open);
    petalPath(ctx, f.kind, len, wid, p.curl);
    // Shaded from the throat out, so most of a petal prints as dots, not solid cream.
    const v = f.lumK * (p.back ? 0.84 : 1);
    const grad = ctx.createLinearGradient(0, 0, 0, -len);
    grad.addColorStop(0, lum(0.26 * v, 1, fresh));
    grad.addColorStop(0.3, lum(0.5 * v, 1, fresh));
    grad.addColorStop(0.72, lum(0.84 * v, 1, fresh));
    grad.addColorStop(1, lum(v, 1, fresh));
    ctx.fillStyle = grad;
    ctx.fill();
    // a darker rim and midrib keep overlapping petals readable once they are dots
    ctx.strokeStyle = lum(0.4 * v, 0.6, fresh);
    ctx.lineWidth = Math.max(0.5, L * 0.016);
    ctx.stroke();
    if (!f.far && f.kind === 'lily' && len > 12) {
      ctx.beginPath();
      ctx.moveTo(0, -len * 0.1);
      ctx.quadraticCurveTo(p.curl * len * 0.05, -len * 0.5, p.curl * len * 0.13, -len * 0.86);
      ctx.strokeStyle = lum(0.42 * v, 0.5, fresh);
      ctx.lineWidth = Math.max(0.6, len * 0.035);
      ctx.stroke();
    }
    ctx.restore();
  }

  const heart = open * (1 - clamp(die * 2.5));
  if (heart <= 0.05) return;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(rot);
  ctx.scale(1, tilt);

  // shaded throat
  const throat = L * 0.27;
  const shade = ctx.createRadialGradient(0, 0, 0, 0, 0, throat);
  shade.addColorStop(0, lum(0.1 * f.lumK, 0.85 * heart, fresh));
  shade.addColorStop(1, lum(0.1 * f.lumK, 0, fresh));
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(0, 0, throat, 0, TAU);
  ctx.fill();

  if (!f.far) {
    if (f.kind === 'lily') {
      ctx.lineWidth = Math.max(0.5, L * 0.014);
      ctx.strokeStyle = lum(0.82, 0.9 * heart, fresh);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.52;
        const sl = L * 0.34 * open * (0.8 + 0.2 * (i % 2));
        const ex = Math.sin(a) * sl;
        const ey = -Math.cos(a) * sl;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(ex * 0.4 + ey * 0.18, ey * 0.4 - ex * 0.18, ex, ey);
        ctx.stroke();
        ctx.fillStyle = redInk(heart, fresh);
        ctx.beginPath();
        ctx.ellipse(ex, ey, Math.max(1, L * 0.045), Math.max(0.8, L * 0.028), a, 0, TAU);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = redInk(heart, fresh);
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1.1, L * (f.kind === 'cosmos' ? 0.17 : 0.22)), 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---------- Vines (drawn by dragging) ----------

export function makeVine(x, y, t) {
  return { pts: [{ x, y }], leaves: [], length: 0, born: t, diedAt: null, dying: 0 };
}

export function stepVine(v, env) {
  if (v.diedAt != null) v.dying = env.still ? 1 : clamp((env.t - v.diedAt) / 1.2);
  for (const leaf of v.leaves) leaf.grown = env.still ? 1 : smooth(clamp((env.t - leaf.born) / 0.7));
}

export function drawVine(ctx, v, k) {
  const { pts } = v;
  if (pts.length < 2 || v.dying >= 1) return;
  const alive = 1 - v.dying;
  ctx.strokeStyle = lum(0.52, alive);
  ctx.lineWidth = Math.max(1.2, 5 * k);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x * k, pts[0].y * k);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = ((pts[i].x + pts[i + 1].x) / 2) * k;
    const my = ((pts[i].y + pts[i + 1].y) / 2) * k;
    ctx.quadraticCurveTo(pts[i].x * k, pts[i].y * k, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x * k, last.y * k);
  ctx.stroke();
  for (const leaf of v.leaves) {
    drawLeaf(ctx, leaf.x * k, leaf.y * k, leaf.angle, leaf.len * k * (leaf.grown ?? 0), 0.44, alive);
  }
}

// ---------- Loose petals (the burst when the email is copied) ----------

export function makeBits(r, x, y, count) {
  const bits = [];
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.6;
    const speed = 160 + r() * 300;
    bits.push({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      rot: r() * TAU,
      vr: (r() - 0.5) * 9,
      age: 0,
      life: 1.1 + r() * 0.9,
      size: 15 + r() * 15,
    });
  }
  return bits;
}

/** Moves the petals and drops the finished ones; returns the survivors. */
export function stepBits(bits, dt) {
  for (const b of bits) {
    b.age += dt;
    b.vy += 560 * dt;
    b.vx *= 1 - Math.min(1, dt * 1.4);
    b.vy *= 1 - Math.min(1, dt * 0.9);
    b.x += b.vx * dt + Math.sin(b.age * 7 + b.rot) * 34 * dt; // flutter
    b.y += b.vy * dt;
    b.rot += b.vr * dt;
  }
  return bits.filter((b) => b.age < b.life);
}

export function drawBits(ctx, bits, k) {
  for (const b of bits) {
    const fade = 1 - smooth(clamp(b.age / b.life));
    ctx.save();
    ctx.translate(b.x * k, b.y * k);
    ctx.rotate(b.rot);
    petalPath(ctx, 'blossom', b.size * k, b.size * k * 0.34);
    ctx.fillStyle = redInk(fade, 1); // always fresh: full red on paper too
    ctx.fill();
    ctx.restore();
  }
}

// ---------- The opening arrangement ----------

/**
 * Lays out the garden a visitor first sees: a few sharp blooms and a few
 * soft ones behind them, kept clear of the name in the lower-left.
 * Returns flower specs (far ones first) for makeFlower.
 */
export function composeGarden(r, w, h) {
  const m = Math.min(w, h);
  const specs = [];
  const place = (far, x0, x1, y0, y1, s0, s1, kind) =>
    specs.push({
      far,
      kind: kind ?? (r() < 0.65 ? 'lily' : 'cosmos'),
      x: lerp(x0, x1, r()) * w,
      y: lerp(y0, y1, r()) * h,
      size: lerp(s0, s1, r()) * m,
    });

  if (w >= 820) {
    place(true, 0.28, 0.46, 0.2, 0.42, 0.2, 0.27, 'lily');
    place(true, 0.8, 0.96, 0.04, 0.2, 0.16, 0.23, 'lily');
    if (r() < 0.65) place(true, 0.56, 0.7, 0.66, 0.86, 0.13, 0.18);
    place(false, 0.7, 0.8, 0.3, 0.42, 0.17, 0.21, 'lily');
    place(false, 0.89, 0.98, 0.7, 0.86, 0.12, 0.16);
    place(false, 0.42, 0.54, 0.13, 0.22, 0.08, 0.11);
    if (r() < 0.7) place(false, -0.01, 0.05, 0.2, 0.28, 0.1, 0.13, 'lily'); // cropped by the left edge
    if (r() < 0.5) place(false, 0.6, 0.67, 0.78, 0.88, 0.06, 0.08, 'cosmos');
  } else {
    // Phones: the name sits in the lower half, so the garden takes the top.
    place(true, 0.15, 0.4, 0.26, 0.38, 0.3, 0.38, 'lily');
    place(true, 0.7, 0.95, 0.06, 0.16, 0.24, 0.3, 'lily');
    place(false, 0.56, 0.72, 0.22, 0.3, 0.26, 0.31, 'lily');
    place(false, 0.06, 0.2, 0.1, 0.16, 0.17, 0.22);
    place(false, 0.86, 0.98, 0.42, 0.5, 0.15, 0.19);
    if (r() < 0.6) place(false, 0.3, 0.42, 0.44, 0.5, 0.09, 0.12, 'cosmos');
  }
  return specs;
}
