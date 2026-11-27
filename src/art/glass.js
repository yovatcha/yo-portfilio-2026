// Liquid glass for the About section — a vanilla port of the "liquid glass"
// look: an SVG displacement filter used as a `backdrop-filter`, plus a soft
// tint, a bright rim and a specular highlight that follows the pointer.
// The facts become glass tiles that tilt toward the pointer and flip to a fun
// fact on click / Enter / Space.
//
// Only Chromium renders SVG filters in `backdrop-filter`; elsewhere the tiles
// fall back to plain frosted glass (CSS).

const svgBackdrop = /Chrome\/|Chromium\//.test(navigator.userAgent);
if (svgBackdrop) document.documentElement.classList.add('has-svg-backdrop');

const BORN = new Date(2002, 8, 21);

const daysOnEarth = () => Math.floor((Date.now() - BORN) / 86400000).toLocaleString('en-US');

/** Glass fact tiles in `list`: tilt + shine on hover, flip on click. */
export function createGlassTiles(list, { reduceMotion = false } = {}) {
  const tiles = [...list.querySelectorAll('.fact')];
  const days = list.querySelector('[data-days]');
  const offs = [];

  for (const tile of tiles) {
    const onMove = (e) => {
      const box = tile.getBoundingClientRect();
      const u = (e.clientX - box.left) / box.width;
      const v = (e.clientY - box.top) / box.height;
      tile.style.setProperty('--mx', `${u * 100}%`);
      tile.style.setProperty('--my', `${v * 100}%`);
      if (reduceMotion || e.pointerType === 'touch') return;
      tile.style.setProperty('--rx', `${(u - 0.5) * 14}deg`);
      tile.style.setProperty('--ry', `${(0.5 - v) * 14}deg`);
    };
    const onLeave = () => {
      tile.style.removeProperty('--rx');
      tile.style.removeProperty('--ry');
    };
    const flip = () => {
      if (days) days.textContent = daysOnEarth();
      const on = tile.classList.toggle('is-flipped');
      tile.setAttribute('aria-pressed', String(on));
    };
    const onKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        flip();
      }
    };
    tile.addEventListener('pointermove', onMove);
    tile.addEventListener('pointerleave', onLeave);
    tile.addEventListener('click', flip);
    tile.addEventListener('keydown', onKey);
    offs.push(() => {
      tile.removeEventListener('pointermove', onMove);
      tile.removeEventListener('pointerleave', onLeave);
      tile.removeEventListener('click', flip);
      tile.removeEventListener('keydown', onKey);
    });
  }
  if (days) days.textContent = daysOnEarth();
  list.classList.add('is-interactive');

  return {
    destroy() {
      offs.forEach((off) => off());
      list.classList.remove('is-interactive');
    },
  };
}
