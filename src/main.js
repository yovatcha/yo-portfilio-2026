import './style.css';
import { createGarden } from './art/garden.js';
import { createBurnPortrait } from './art/burn.js';
import { createGlassTiles } from './art/glass.js';
import { createFaqDeck } from './art/deck.js';
import { seedFromUrl, randomSeed, formatSeed } from './art/seed.js';
import skills from './skills.json';
import projects from './projects.json';
import tracks from './tracks.json';
import { renderSkills, renderProjects } from './render.js';

const root = document.documentElement;
root.classList.add('js'); // lets the CSS pin the nav only when scripts can restyle it
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = (e) => e.pointerType === 'mouse' || e.pointerType === 'pen';

// ---------- Grow the garden ----------
// `html.has-garden` lets the CSS drop its plain navy hero once the canvas has
// painted; without WebGL (`html.no-webgl`) that fallback simply stays.
const canvas = document.getElementById('garden');
const hero = document.getElementById('hero');
const garden =
  canvas &&
  createGarden(canvas, {
    seed: seedFromUrl() ?? randomSeed(),
    hero,
    root: document.getElementById('content'),
    reduceMotion,
    onReady: () => root.classList.add('has-garden'),
  });

if (!garden) {
  root.classList.add('no-webgl');
  canvas?.remove();
}

// ---------- Hero: edition number, replant, keep the print ----------
const editionEl = document.getElementById('edition');
const showEdition = () => {
  if (editionEl && garden) editionEl.textContent = `№ ${formatSeed(garden.seed)}`;
};
showEdition();

document.getElementById('replant')?.addEventListener('click', () => {
  garden?.replant();
  showEdition();
});

const keepBtn = document.getElementById('keep-print');
keepBtn?.addEventListener('click', async () => {
  if (!garden) return;
  const blob = await garden.savePoster({ credit: 'Vatcharamai Rodring · chaiyoyo.com' });
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `garden-${formatSeed(garden.seed)}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
});

// ---------- Scroll: the print gives way to paper ----------
// The garden needs to know where the hero ends on screen; the nav switches
// from cream-on-navy to navy-on-cream once the paper reaches it.
// Parallax rides along: the garden's layers lift at their own pace, the hero
// copy sinks as it goes (`--hero-p`, 0→1), and any `[data-parallax="speed"]`
// element drifts by `--py` relative to the middle of the screen.
const drifters = reduceMotion ? [] : [...document.querySelectorAll('[data-parallax]')];
const onScreen = new Set();
const drift = new Map(); // el → current offset, so measuring ignores our own nudge
if (drifters.length) {
  const seen = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => (e.isIntersecting ? onScreen.add(e.target) : onScreen.delete(e.target)));
      requestScroll();
    },
    { rootMargin: '20% 0px' }
  );
  drifters.forEach((el) => seen.observe(el));
}

function updateScroll() {
  scrollQueued = false;
  if (hero) {
    const box = hero.getBoundingClientRect();
    garden?.setPaper(box.bottom);
    garden?.setScroll(window.scrollY);
    root.classList.toggle('is-paper', box.bottom < 72);
    if (!reduceMotion) {
      const p = Math.min(1, Math.max(0, -box.top / box.height));
      hero.style.setProperty('--hero-p', p.toFixed(4));
    }
  }
  const mid = window.innerHeight / 2;
  for (const el of onScreen) {
    const box = el.getBoundingClientRect();
    const was = drift.get(el) ?? 0;
    const offset = (box.top - was + box.height / 2 - mid) * -(Number(el.dataset.parallax) || 0);
    drift.set(el, offset);
    el.style.setProperty('--py', `${offset.toFixed(1)}px`);
  }
}
let scrollQueued = false;
function requestScroll() {
  if (scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(updateScroll);
}
window.addEventListener('scroll', requestScroll, { passive: true });
window.addEventListener('resize', requestScroll);
updateScroll();

// ---------- Mobile nav (hamburger toggle) ----------
const nav = document.querySelector('.nav');
const navToggle = document.getElementById('nav-toggle');
const navMenu = document.getElementById('nav-menu');
if (nav && navToggle && navMenu) {
  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  navToggle.addEventListener('click', () =>
    setOpen(!nav.classList.contains('is-open'))
  );
  // Close after tapping a link, or when clicking outside the nav.
  navMenu.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('click', (e) => {
    if (nav.classList.contains('is-open') && !nav.contains(e.target)) {
      setOpen(false);
    }
  });
}

// ---------- Skill chips (rendered from skills.json) ----------
// skills.json is grouped by domain so a visitor can see where the lean is:
//   [{ group: "Frontend", skills: [{ name, level: 1–5, … }, …] }, …]
// `level` is how many of a chip's five petals are inked.
// The markup builders live in render.js so the build step can pre-render the
// same HTML into the static page for crawlers. innerHTML replaces the
// pre-rendered content with an identical copy — no duplication.
const skillsEl = document.getElementById('skills-grid');
if (skillsEl) {
  skillsEl.innerHTML = renderSkills(skills);
}

// ---------- Project plates (rendered from projects.json) ----------
// Each project: { tag, title, description, tech: [..], link }
const projectsEl = document.getElementById('projects-grid');
if (projectsEl) {
  projectsEl.innerHTML = renderProjects(projects);
}

// ---------- Spotify player (random track + nav play button) ----------
// Uses Spotify's IFrame API so the nav button can actually start/stop playback
// (a button click is the user gesture browsers require to allow audio).
// Tracks come from /api/spotify (a random song from a public playlist), with
// tracks.json as the fallback when the API is unavailable (e.g. `vite dev`).
// Full playback needs the visitor to be logged into Spotify; otherwise it's a
// ~30s preview. There is no true autoplay — the first play needs a click.
const spotifyMount = document.getElementById('spotify-embed');
if (spotifyMount) {
  const nowEl = document.getElementById('music-now');
  const navPlay = document.getElementById('nav-play');
  const loadingEl = document.getElementById('music-loading');
  let pool = tracks.map((t) => ({ id: t.id, type: t.type || 'track' }));
  let lastIndex = -1;
  let controller = null;

  // Loading state: active until the Spotify player has mounted.
  const setLoading = (loading) => {
    navPlay?.classList.toggle('is-loading', loading);
    navPlay?.setAttribute('aria-busy', String(loading));
    if (loadingEl) loadingEl.style.display = loading ? '' : 'none';
  };
  setLoading(true);

  const pickRandom = () => {
    let i = Math.floor(Math.random() * pool.length);
    if (pool.length > 1) {
      while (i === lastIndex) i = Math.floor(Math.random() * pool.length);
    }
    lastIndex = i;
    return pool[i];
  };

  const setNow = (t) => {
    if (nowEl) nowEl.textContent = t?.name ? `${t.name} — ${t.artist}` : '';
  };

  const setPlayingState = (playing) => {
    garden?.setPlaying(playing); // the flowers sway to it
    if (navPlay) {
      navPlay.classList.toggle('is-playing', playing);
      navPlay.setAttribute('aria-pressed', String(playing));
      navPlay.setAttribute('aria-label', playing ? 'Pause music' : 'Play music');
      navPlay.title = playing ? 'Pause music' : 'Play music';
    }
  };

  const uriOf = (t) => `spotify:${t.type || 'track'}:${t.id}`;

  // Load a random track into the player. `autoplay` only works when called
  // from a user gesture (the nav button / shuffle click).
  const loadRandomTrack = (autoplay = false) => {
    if (!controller || !pool.length) return;
    const t = pickRandom();
    controller.loadUri(uriOf(t));
    setNow(t);
    if (autoplay) controller.play();
  };

  const buildPlayer = () => {
    // Resolve the track pool (API first, fallback to tracks.json), then mount.
    const start = (initial) => {
      window.onSpotifyIframeApiReady = (IFrameAPI) => {
        IFrameAPI.createController(
          spotifyMount,
          { uri: uriOf(initial), width: '100%', height: 152, theme: 'dark' },
          (ctrl) => {
            controller = ctrl;
            setLoading(false);
            setNow(initial);
            ctrl.addListener('playback_update', (e) => {
              setPlayingState(!e.data.isPaused);
            });
          }
        );
      };
      // Inject the IFrame API script once.
      if (!document.getElementById('spotify-iframe-api')) {
        const s = document.createElement('script');
        s.id = 'spotify-iframe-api';
        s.src = 'https://open.spotify.com/embed/iframe-api/v1';
        s.async = true;
        document.body.appendChild(s);
      }
    };

    (async () => {
      try {
        const res = await fetch('/api/spotify');
        const ct = res.headers.get('content-type') || '';
        if (res.ok && ct.includes('application/json')) {
          const data = await res.json();
          if (Array.isArray(data.tracks) && data.tracks.length) {
            pool = data.tracks.map((t) => ({ ...t, type: 'track' }));
          }
        }
      } catch {
        /* keep the tracks.json fallback */
      }
      lastIndex = Math.floor(Math.random() * pool.length);
      start(pool[lastIndex]);
    })();
  };

  buildPlayer();

  // Nav button: toggle play/pause (starts the first random track if idle).
  navPlay?.addEventListener('click', () => controller?.togglePlay());

  // Shuffle: load a different random track and play it (user gesture → audio OK).
  document
    .getElementById('music-shuffle')
    ?.addEventListener('click', () => loadRandomTrack(true));
}

// ---------- About: burn the print to reveal the photo ----------
// Skipped without WebGL (the plain photo just stays).
const portraitFrame = document.querySelector('.about__frame');
const portraitImg = portraitFrame?.querySelector('.about__img');
const portrait =
  garden &&
  portraitImg &&
  createBurnPortrait(portraitFrame, {
    img: portraitImg,
    reduceMotion,
    onReprint: () => portraitFrame.focus({ preventScroll: true }),
  });
if (portrait) {
  document.querySelector('.about__reprint')?.addEventListener('click', () => portrait.reprint());
}

// ---------- About: liquid-glass fact tiles that flip ----------
const factList = document.querySelector('.about__facts');
if (factList) createGlassTiles(factList, { reduceMotion });

// ---------- FAQ: a fanned deck of cards ----------
const faqDeck = document.querySelector('[data-faq]');
if (faqDeck) createFaqDeck(faqDeck, { reduceMotion });

// ---------- Scroll-reveal animations for content ----------
const revealTargets = document.querySelectorAll(
  '.section__head, .section > .wrap > .section__lead, .about__portrait, .about__text, .timeline__title, .timeline__item, .plate, .skill-group, .music, .faq, .contact'
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
  { threshold: 0.12 }
);
revealTargets.forEach((el) => io.observe(el));

// ---------- Copy email to clipboard ----------
// The email lives only on the mailto link, so updating it there keeps the
// copy button in sync automatically.
const copyBtn = document.getElementById('copy-email');
const emailLink = document.getElementById('email-link');
if (copyBtn && emailLink) {
  const email = emailLink.getAttribute('href').replace(/^mailto:/, '');
  const label = copyBtn.querySelector('.copy-email__label');
  const original = label?.textContent ?? 'Copy email';
  let resetId;

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for browsers / insecure contexts without the Clipboard API.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* give up silently */
      }
      ta.remove();
    }
  };

  copyBtn.addEventListener('click', async () => {
    await copyText(email);
    copyBtn.classList.add('is-copied');
    if (label) label.textContent = 'Copied!';
    // A puff of red petals from the button.
    const box = copyBtn.getBoundingClientRect();
    garden?.burst(box.left + box.width / 2, box.top + box.height / 2);
    clearTimeout(resetId);
    resetId = setTimeout(() => {
      copyBtn.classList.remove('is-copied');
      if (label) label.textContent = original;
    }, 1600);
  });
}

// ---------- Garden ↔ page wiring ----------
if (garden) {
  // A project plate under the pointer (or holding focus) is printed back in
  // full ink by the canvas, and a flower opens beside the cursor.
  let lit = null;
  const light = (plate) => {
    if (plate === lit) return;
    lit?.classList.remove('is-lit');
    lit = plate;
    lit?.classList.add('is-lit');
    garden.spotlight(lit);
  };
  projectsEl?.addEventListener('pointerover', (e) => {
    if (!finePointer(e)) return;
    const plate = e.target.closest('.plate');
    if (plate && plate !== lit) {
      const box = plate.getBoundingClientRect();
      const x = Math.min(e.clientX + 90, box.right - 60);
      garden.plantAt(x, e.clientY, { kind: 'cosmos', size: 42, stem: false });
    }
    light(plate);
  });
  projectsEl?.addEventListener('pointerleave', () => light(null));
  projectsEl?.addEventListener('focusin', (e) => light(e.target.closest('.plate')));
  projectsEl?.addEventListener('focusout', () => light(null));

  // A skill chip under the pointer opens a small flower behind it; more
  // petals on the chip, bigger flower. Throttled per chip.
  const lastBloom = new WeakMap();
  const bloomSkill = (chip) => {
    const now = performance.now();
    if (!chip || now - (lastBloom.get(chip) ?? -Infinity) < 2500) return;
    lastBloom.set(chip, now);
    const box = chip.getBoundingClientRect();
    const level = Number(chip.dataset.level) || 3;
    garden.plantAt(box.left + box.width / 2, box.top + box.height / 2, {
      kind: 'blossom',
      size: 30 + level * 7,
      stem: false,
    });
  };
  skillsEl?.addEventListener('pointerover', (e) => {
    if (finePointer(e)) bloomSkill(e.target.closest('.skill'));
  });
  skillsEl?.addEventListener('focusin', (e) => bloomSkill(e.target.closest('.skill')));
}

// ---------- Footer year ----------
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();
