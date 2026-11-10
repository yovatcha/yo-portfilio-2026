import { makeCanvasTexture, cssVar } from './materials.js';

// Canvas-drawn UI for the in-room screens (monitor, phone) and the neon sign.
// Everything is redrawn on demand, never per frame.

function wrap(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const slug = (s) =>
  s.toLowerCase().replace(/&/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Monitor: a terminal-style "project viewer" cycling through projects.json.
 */
export function createMonitorScreen(projects) {
  const W = 1280;
  const H = 720;
  const { ctx, texture } = makeCanvasTexture(W, H);
  texture.anisotropy = 8;
  let index = 0;

  function draw() {
    const mono = cssVar('--font-mono', 'monospace');
    const display = cssVar('--font-display', 'sans-serif');
    const p = projects[index];

    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, W, H);

    // title bar
    ctx.fillStyle = '#0d1220';
    ctx.fillRect(0, 0, W, 64);
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(40 + i * 30, 32, 9, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#6f7a96';
    ctx.font = `26px ${mono}`;
    ctx.fillText(`~/projects/${slug(p.title)}`, 150, 41);

    // body — big type, few words: this is read from across the room
    const x = 64;
    ctx.fillStyle = '#4ff3ff';
    ctx.font = `30px ${mono}`;
    ctx.fillText(`$ open ${slug(p.title)}`, x, 132);

    ctx.fillStyle = '#ff7fb0';
    ctx.font = `30px ${mono}`;
    ctx.fillText((p.tag || 'project').toUpperCase(), x, 196);

    ctx.fillStyle = '#ffffff';
    ctx.font = `800 120px ${display}`;
    ctx.fillText(p.title, x - 4, 310);

    ctx.fillStyle = '#d6d8e6';
    ctx.font = `40px ${display}`;
    const all = wrap(ctx, p.description, W - x * 2);
    const lines = all.slice(0, 3);
    if (all.length > 3) lines[2] = lines[2].replace(/\s*\S*$/, ' …');
    lines.forEach((l, i) => ctx.fillText(l, x, 385 + i * 54));

    // tech chips
    let cx = x;
    ctx.font = `500 30px ${mono}`;
    (p.tech || []).forEach((t) => {
      const w = ctx.measureText(t).width + 36;
      if (cx + w > W - x) return;
      ctx.fillStyle = 'rgba(255,61,139,0.16)';
      ctx.beginPath();
      ctx.roundRect(cx, 560, w, 54, 10);
      ctx.fill();
      ctx.fillStyle = '#ffb3cf';
      ctx.fillText(t, cx + 18, 597);
      cx += w + 14;
    });

    // footer / pager
    ctx.fillStyle = '#8a93ad';
    ctx.font = `26px ${mono}`;
    ctx.fillText(`◀ ${index + 1}/${projects.length} ▶   click screen for next`, x, 682);

    // scanlines
    ctx.fillStyle = 'rgba(255,255,255,0.012)';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);

    texture.needsUpdate = true;
  }

  draw();
  return {
    texture,
    redraw: draw,
    get index() {
      return index;
    },
    show(i) {
      const n = projects.length;
      const next = ((i % n) + n) % n;
      if (next === index) return;
      index = next;
      draw();
    },
    next() {
      this.show(index + 1);
    },
  };
}

/**
 * Phone lying on the desk: lock screen with an incoming "say hello" message.
 */
export function createPhoneScreen() {
  const W = 360;
  const H = 720;
  const { ctx, texture } = makeCanvasTexture(W, H);
  let copied = false;

  function draw() {
    const mono = cssVar('--font-mono', 'monospace');
    const display = cssVar('--font-display', 'sans-serif');
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a0f2e');
    g.addColorStop(1, '#3a0f2a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#f2efe9';
    ctx.textAlign = 'center';
    ctx.font = `600 96px ${display}`;
    ctx.fillText('02:14', W / 2, 190);
    ctx.font = `20px ${mono}`;
    ctx.fillStyle = '#c9b8d8';
    ctx.fillText('bangkok · th', W / 2, 228);

    // notification card
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.roundRect(24, 300, W - 48, 150, 22);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = copied ? '#2fe6a8' : '#ff7fb0';
    ctx.font = `18px ${mono}`;
    ctx.fillText(copied ? 'CLIPBOARD' : 'MESSAGES · now', 48, 340);
    ctx.fillStyle = '#f2efe9';
    ctx.font = `600 26px ${display}`;
    ctx.fillText(copied ? 'Email copied ✓' : 'Say hello 👋', 48, 382);
    ctx.font = `20px ${display}`;
    ctx.fillStyle = '#c9b8d8';
    ctx.fillText(copied ? 'paste it anywhere' : 'tap to copy my email', 48, 418);

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.roundRect(W / 2 - 60, H - 30, 120, 6, 3);
    ctx.fill();
    texture.needsUpdate = true;
  }

  draw();
  let resetId;
  return {
    texture,
    redraw: draw,
    flashCopied() {
      copied = true;
      draw();
      clearTimeout(resetId);
      resetId = setTimeout(() => {
        copied = false;
        draw();
      }, 1800);
    },
  };
}

/**
 * Neon wall sign. Drawn twice — a wide blurred halo and a crisp tube — so it
 * still glows when bloom is disabled on low-end devices.
 */
export function createNeonSign() {
  const W = 1024;
  const H = 400;
  const { ctx, texture } = makeCanvasTexture(W, H);

  function draw() {
    const script = cssVar('--font-neon', 'cursive');
    const mono = cssVar('--font-mono', 'monospace');
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `200px ${script}`;
    ctx.shadowColor = '#ff3d8b';
    ctx.shadowBlur = 40;
    ctx.fillStyle = '#ff3d8b';
    ctx.fillText('chaiyo', W / 2, H / 2 - 20);
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffd1e4';
    ctx.fillText('chaiyo', W / 2, H / 2 - 20);

    ctx.shadowColor = '#4ff3ff';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#c9fbff';
    ctx.font = `32px ${mono}`;
    ctx.fillText('— still online —', W / 2, H - 50);
    ctx.shadowBlur = 0;
    texture.needsUpdate = true;
  }

  draw();
  return { texture, redraw: draw };
}

/**
 * Wall poster above the record shelf.
 */
export function createPoster() {
  const W = 420;
  const H = 560;
  const { ctx, texture } = makeCanvasTexture(W, H);

  function draw() {
    const display = cssVar('--font-display', 'sans-serif');
    const mono = cssVar('--font-mono', 'monospace');
    ctx.fillStyle = '#e9e2d4';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ff3d8b';
    ctx.beginPath();
    ctx.arc(W / 2, 220, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#141322';
    ctx.font = `800 78px ${display}`;
    ctx.textAlign = 'center';
    ctx.fillText('BKK', W / 2, 440);
    ctx.font = `20px ${mono}`;
    ctx.fillText('13.75°N  100.50°E', W / 2, 480);
    ctx.fillText('ship it. sleep later.', W / 2, 520);
    texture.needsUpdate = true;
  }

  draw();
  return { texture, redraw: draw };
}
