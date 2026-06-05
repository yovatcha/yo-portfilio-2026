import './style.css';
import { createScene } from './scene.js';
import skills from './skills.json';

// ---------- Boot the 3D scene ----------
const canvas = document.getElementById('webgl');
const experience = createScene(canvas);

// Hide the loader once the first frame is on screen.
window.addEventListener('load', () => {
  requestAnimationFrame(() => {
    const loader = document.getElementById('loader');
    loader?.classList.add('is-hidden');
    setTimeout(() => loader?.remove(), 800);
  });
});

// ---------- Drive the scene from page scroll ----------
function updateScroll() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const progress = max > 0 ? window.scrollY / max : 0;
  experience.setScroll(progress);
}
window.addEventListener('scroll', updateScroll, { passive: true });
window.addEventListener('resize', updateScroll);
updateScroll();

// ---------- Skill bubbles (rendered from skills.json) ----------
// Each skill: { name, icon, color, level: 1–5 } or an explicit { size } in px.
// `icon` is a Simple Icons slug (https://simpleicons.org) — `level` controls
// the bubble size: the higher the level, the bigger (= more expertise).
const bubblesEl = document.getElementById('bubbles');
if (bubblesEl) {
  const SIZE_BY_LEVEL = { 1: 68, 2: 82, 3: 100, 4: 122, 5: 150 };
  bubblesEl.innerHTML = skills
    .map((s) => {
      const size = s.size ?? SIZE_BY_LEVEL[s.level] ?? 90;
      const color = s.color ?? '#7c5cff';
      return `
        <div class="bubble" style="--size:${size}px;--c:${color}" tabindex="0" aria-label="${s.name}">
          <img class="bubble__logo" src="https://cdn.simpleicons.org/${s.icon}/white" alt="" aria-hidden="true" loading="lazy" />
          <span class="bubble__name">${s.name}</span>
        </div>`;
    })
    .join('');
}

// ---------- Scroll-reveal animations for content ----------
const revealTargets = document.querySelectorAll(
  '.panel, .card, .bubbles, .section__title'
);
revealTargets.forEach((el) => el.classList.add('reveal'));

const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15 }
);
revealTargets.forEach((el) => io.observe(el));

// ---------- About portrait: 3D tilt that follows the cursor ----------
const aboutPhoto = document.getElementById('aboutPhoto');
if (aboutPhoto && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const img = aboutPhoto.querySelector('.about__img');
  const glow = aboutPhoto.querySelector('.about__glow');
  const MAX = 16; // max degrees of tilt

  function tilt(e) {
    const r = aboutPhoto.getBoundingClientRect();
    // -0.5 … 0.5 relative to the photo's center
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    img.style.setProperty('--ry', `${px * MAX}deg`);
    img.style.setProperty('--rx', `${-py * MAX}deg`);
    // Glow drifts opposite the tilt for a parallax depth cue.
    glow.style.setProperty('--gx', `${-px * 40}px`);
    glow.style.setProperty('--gy', `${-py * 40}px`);
  }

  function reset() {
    img.style.setProperty('--rx', '0deg');
    img.style.setProperty('--ry', '0deg');
    glow.style.setProperty('--gx', '0px');
    glow.style.setProperty('--gy', '0px');
  }

  // Track across the whole section so the effect feels responsive.
  const aboutSection = document.getElementById('about');
  aboutSection.addEventListener('pointermove', tilt);
  aboutSection.addEventListener('pointerleave', reset);
}

// ---------- Footer year ----------
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();
