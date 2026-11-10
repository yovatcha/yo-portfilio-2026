import './style.css';
import { createScene } from './scene.js';
import { createStationTracker } from './room/stations.js';
import skills from './skills.json';
import projects from './projects.json';
import tracks from './tracks.json';
import { renderBubbles, renderProjects } from './render.js';

// ---------- Boot the 3D room ----------
const canvas = document.getElementById('webgl');
const loader = document.getElementById('loader');
const loaderPct = document.getElementById('loader-pct');
const loaderBar = document.getElementById('loader-bar');

const hideLoader = () => {
  loader?.classList.add('is-hidden');
  document.documentElement.classList.add('is-ready');
  setTimeout(() => loader?.remove(), 900);
};

const experience = createScene(canvas, {
  projects,
  skills,
  portraitUrl: 'images/IMG_6042-Photoroom_1.webp',
  onProgress(p) {
    const pct = Math.round(p * 100);
    if (loaderPct) loaderPct.textContent = `${pct}%`;
    loaderBar?.style.setProperty('--p', p);
  },
  onReady: () => requestAnimationFrame(hideLoader),
});

// No WebGL: the HTML site stands on its own.
if (!experience) {
  document.documentElement.classList.add('no-webgl');
  canvas?.remove();
  window.addEventListener('load', hideLoader);
}
// Never leave visitors stuck behind the loader (slow CDN logos, etc.).
setTimeout(hideLoader, 6000);

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

// ---------- Drive the camera from page scroll ----------
// Each section owns a camera "station" in the room; the progress rail mirrors it.
const tracker = createStationTracker();
const railLinks = [...document.querySelectorAll('.rail a')];
let lastActive = -1;
function updateScroll() {
  const f = tracker.read();
  experience?.setStation(f);
  const active = Math.round(f);
  if (active !== lastActive) {
    lastActive = active;
    railLinks.forEach((a, i) => a.classList.toggle('is-active', i === active));
    document.documentElement.dataset.station = experience?.stations[active]?.id ?? '';
  }
}
window.addEventListener('scroll', updateScroll, { passive: true });
window.addEventListener('resize', updateScroll);
updateScroll();

// ---------- Skill bubbles (rendered from skills.json) ----------
// skills.json is grouped by domain so a visitor can see where the lean is:
//   [{ group: "Frontend", skills: [{ name, icon, color, level: 1–5 }, …] }, …]
// `icon` is a Simple Icons slug (https://simpleicons.org); `level` (or an
// explicit `size` in px) controls the bubble size — bigger = more expertise.
// The markup builders live in render.js so the build step can pre-render the
// same HTML into the static page for crawlers. innerHTML replaces the
// pre-rendered content with an identical copy — no duplication.
const bubblesEl = document.getElementById('bubbles');
if (bubblesEl) {
  bubblesEl.innerHTML = renderBubbles(skills);
}

// ---------- Project cards (rendered from projects.json) ----------
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
let togglePlay = () => {};
const spotifyMount = document.getElementById('spotify-embed');
if (spotifyMount) {
  const nowEl = document.getElementById('music-now');
  const navPlay = document.getElementById('nav-play');
  const loadingEl = document.getElementById('music-loading');
  let pool = tracks.map((t) => ({ id: t.id, type: t.type || 'track' }));
  let lastIndex = -1;
  let controller = null;
  let isPlaying = false;

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
    if (nowEl) nowEl.textContent = t?.name ? `🎵 ${t.name} — ${t.artist}` : '';
  };

  const setPlayingState = (playing) => {
    isPlaying = playing;
    experience?.setPlaying(playing);
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
  togglePlay = () => controller?.togglePlay();
  navPlay?.addEventListener('click', () => togglePlay());

  // Shuffle: load a different random track and play it (user gesture → audio OK).
  document
    .getElementById('music-shuffle')
    ?.addEventListener('click', () => loadRandomTrack(true));
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
    clearTimeout(resetId);
    resetId = setTimeout(() => {
      copyBtn.classList.remove('is-copied');
      if (label) label.textContent = original;
    }, 1600);
  });
}

// ---------- Room ↔ page wiring ----------
if (experience) {
  // Clicking an object flies to its section; clicking again runs its action.
  experience.onSelect(({ station, action }) => {
    if (action === 'go') {
      document.getElementById(station)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (action === 'toggle-music') {
      togglePlay();
    } else if (action === 'copy-email') {
      copyBtn?.click();
      experience.flashPhone();
    }
  });

  // Hovering a project card puts it on the monitor.
  projectsEl?.addEventListener('pointerover', (e) => {
    const card = e.target.closest('[data-project]');
    if (card) experience.showProject(Number(card.dataset.project));
  });
  projectsEl?.addEventListener('focusin', (e) => {
    const card = e.target.closest('[data-project]');
    if (card) experience.showProject(Number(card.dataset.project));
  });

  // Hovering a skill chip makes its orb jump in the jar.
  const popSkill = (e) => {
    const b = e.target.closest('[data-skill]');
    if (b) experience.highlightSkill(b.dataset.skill);
  };
  bubblesEl?.addEventListener('mouseover', popSkill);
  bubblesEl?.addEventListener('focusin', popSkill);
}

// ---------- Cursor: a ring that follows the pointer and names 3D objects ----------
const cursor = document.getElementById('cursor');
if (cursor && experience && window.matchMedia('(pointer: fine)').matches) {
  const label = cursor.querySelector('.cursor__label');
  let x = -100;
  let y = -100;
  let cx = x;
  let cy = y;
  window.addEventListener(
    'pointermove',
    (e) => {
      x = e.clientX;
      y = e.clientY;
      cursor.classList.add('is-on');
    },
    { passive: true }
  );
  document.addEventListener('pointerleave', () => cursor.classList.remove('is-on'));
  experience.onHover((text) => {
    cursor.classList.toggle('is-target', !!text);
    if (text && label) label.textContent = text;
  });
  const follow = () => {
    cx += (x - cx) * 0.25;
    cy += (y - cy) * 0.25;
    cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    requestAnimationFrame(follow);
  };
  follow();
}

// ---------- Footer year ----------
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();
