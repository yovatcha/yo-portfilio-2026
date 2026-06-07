import './style.css';
import { createScene } from './scene.js';
import skills from './skills.json';
import projects from './projects.json';
import tracks from './tracks.json';

// Escape user-provided text before injecting into markup.
const esc = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

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
// skills.json is grouped by domain so a visitor can see where the lean is:
//   [{ group: "Frontend", skills: [{ name, icon, color, level: 1–5 }, …] }, …]
// `icon` is a Simple Icons slug (https://simpleicons.org); `level` (or an
// explicit `size` in px) controls the bubble size — bigger = more expertise.
const bubblesEl = document.getElementById('bubbles');
if (bubblesEl) {
  const SIZE_BY_LEVEL = { 1: 46, 2: 56, 3: 68, 4: 82, 5: 98 };
  const renderBubble = (s) => {
    const size = s.size ?? SIZE_BY_LEVEL[s.level] ?? 90;
    const color = s.color ?? '#7c5cff';
    // Branded tech uses a Simple Icons logo; concept skills (no brand logo)
    // fall back to a short text badge from `abbr` (or the name's initials).
    const inner = s.icon
      ? `<img class="bubble__logo" src="https://cdn.simpleicons.org/${esc(s.icon)}/white" alt="" aria-hidden="true" loading="lazy" />`
      : `<span class="bubble__abbr">${esc(s.abbr || s.name)}</span>`;
    return `
        <div class="bubble" style="--size:${size}px;--c:${color}" tabindex="0" aria-label="${esc(s.name)}">
          ${inner}
          <span class="bubble__name">${esc(s.name)}</span>
        </div>`;
  };
  bubblesEl.innerHTML = skills
    .map(
      (g) => `
      <div class="skill-group">
        <h3 class="skill-group__title">${esc(g.group)}</h3>
        <div class="bubbles__cloud">${g.skills.map(renderBubble).join('')}</div>
      </div>`
    )
    .join('');
}

// ---------- Project cards (rendered from projects.json) ----------
// Each project: { tag, title, description, tech: [..], link }
const projectsEl = document.getElementById('projects-grid');
if (projectsEl) {
  projectsEl.innerHTML = projects
    .map((p) => {
      const tech = (p.tech || [])
        .map((t) => `<span>${esc(t)}</span>`)
        .join('');
      const link = p.link
        ? `<a href="${esc(p.link)}" class="card__link"${
            p.link.startsWith('http') ? ' target="_blank" rel="noopener"' : ''
          }>View project →</a>`
        : '';
      return `
        <article class="card">
          ${p.tag ? `<div class="card__tag">${esc(p.tag)}</div>` : ''}
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.description)}</p>
          <div class="card__tech">${tech}</div>
          ${link}
        </article>`;
    })
    .join('');
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
  navPlay?.addEventListener('click', () => {
    if (!controller) return;
    controller.togglePlay();
  });

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

// ---------- Footer year ----------
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();
