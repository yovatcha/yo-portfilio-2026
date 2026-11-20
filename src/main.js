import './style.css';
import { createScene } from './scene.js';
import { createStationTracker } from './meadow/stations.js';
import skills from './skills.json';
import projects from './projects.json';
import tracks from './tracks.json';
import { renderBubbles, renderProjects } from './render.js';

const root = document.documentElement;

// ---------- Boot the 3D meadow ----------
const canvas = document.getElementById('webgl');
const loader = document.getElementById('loader');
const loaderBar = document.getElementById('loader-bar');

const hideLoader = () => {
  loader?.classList.add('is-hidden');
  root.classList.add('is-ready');
  setTimeout(() => loader?.remove(), 900);
};

const experience = createScene(canvas, {
  projects,
  skills,
  // The meadow is procedural — there is nothing to download, so the bar just
  // fills once the field has been built.
  onProgress: (p) => loaderBar?.style.setProperty('--p', p),
  onReady: () => requestAnimationFrame(hideLoader),
});

// No WebGL: the HTML site stands on its own.
if (!experience) {
  root.classList.add('no-webgl');
  canvas?.remove();
  window.addEventListener('load', hideLoader);
}
// Never leave visitors stuck behind the loader.
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

// ---------- Walk the path from page scroll ----------
// Each section owns a stop on the path; the trail on the right mirrors it.
// The browser's theme colour follows the time of day at each stop.
const THEME = {
  hero: '#3d93ee',
  about: '#3d93ee',
  projects: '#4a94e2',
  skills: '#5a93d6',
  music: '#e9b877',
  faq: '#f0a878',
  contact: '#f29a72',
};
const themeMeta = document.querySelector('meta[name="theme-color"]');
const tracker = createStationTracker();
const railLinks = [...document.querySelectorAll('.rail a')];
let lastActive = -1;
function updateScroll() {
  const f = tracker.read();
  experience?.setStation(f);
  // The work screen around the hero dissolves over the first part of the scroll.
  root.style.setProperty('--escape', Math.min(1, window.scrollY / (window.innerHeight * 0.45)).toFixed(3));
  const active = Math.round(f);
  if (active !== lastActive) {
    lastActive = active;
    railLinks.forEach((a, i) => {
      a.classList.toggle('is-active', i === active);
      if (i === active) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    const id = railLinks[active]?.getAttribute('href').slice(1) ?? '';
    root.dataset.station = id;
    if (experience && THEME[id]) themeMeta?.setAttribute('content', THEME[id]);
  }
}
window.addEventListener('scroll', updateScroll, { passive: true });
window.addEventListener('resize', updateScroll);
updateScroll();

// ---------- Skill chips (rendered from skills.json) ----------
// skills.json is grouped by domain so a visitor can see where the lean is:
//   [{ group: "Frontend", skills: [{ name, icon, color, level: 1–5 }, …] }, …]
// `icon` is a Simple Icons slug (https://simpleicons.org); `level` sets how
// tall that skill's flower grows in the bed.
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
const revealTargets = document.querySelectorAll('.sheet, .panel, .card');
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
  { threshold: 0.08 }
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

// ---------- Meadow ↔ page wiring ----------
const jumpTo = (id, behavior = 'smooth') =>
  document.getElementById(id)?.scrollIntoView({ behavior, block: 'start' });

if (experience) {
  const chipOf = (name) =>
    [...(bubblesEl?.querySelectorAll('[data-skill]') ?? [])].find((b) => b.dataset.skill === name);

  // Clicking a landmark walks to its section; clicking again runs its action.
  experience.onSelect(({ station, action, project, skill }) => {
    if (action === 'go') {
      jumpTo(station);
    } else if (action === 'toggle-music') {
      togglePlay();
    } else if (action === 'copy-email') {
      copyBtn?.click();
      experience.flashContact();
    } else if (action === 'project') {
      const card = projectsEl?.querySelector(`[data-project="${project}"]`);
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card?.classList.add('is-lit');
      setTimeout(() => card?.classList.remove('is-lit'), 1600);
    } else if (action === 'skill') {
      chipOf(skill)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  // Hovering a project card shakes its blossom tree.
  const showProject = (e) => {
    const card = e.target.closest('[data-project]');
    if (card) experience.showProject(Number(card.dataset.project));
  };
  projectsEl?.addEventListener('pointerover', showProject);
  projectsEl?.addEventListener('focusin', showProject);

  // Hovering a skill chip makes its flower nod — and the other way round.
  const popSkill = (e) => {
    const b = e.target.closest('[data-skill]');
    if (b) experience.highlightSkill(b.dataset.skill);
  };
  bubblesEl?.addEventListener('mouseover', popSkill);
  bubblesEl?.addEventListener('focusin', popSkill);
  let litChip = null;
  experience.onSkillHover((name) => {
    litChip?.classList.remove('is-lit');
    litChip = name ? chipOf(name) : null;
    litChip?.classList.add('is-lit');
  });
}

// ---------- Zoom out: the whole field as a map ----------
// The trail's seven links double as the map's pins: while the map is open the
// scene reports each stop's screen position and the links are laid over them.
const mapBtn = document.getElementById('nav-map');
if (experience && mapBtn) {
  const sections = [...document.querySelectorAll('.section')];
  let mapOpen = false;

  const setMap = (open, { focus = true } = {}) => {
    if (open === mapOpen) return;
    mapOpen = open;
    root.classList.toggle('is-map', open);
    sections.forEach((s) => (s.inert = open));
    mapBtn.setAttribute('aria-pressed', String(open));
    mapBtn.setAttribute('aria-label', open ? 'Zoom back in' : 'Zoom out to the map');
    mapBtn.title = open ? 'Zoom back in (Esc)' : 'Zoom out to the map (M)';
    experience.setMap(open);
    if (!focus) return;
    if (open) railLinks[lastActive]?.focus({ preventScroll: true });
    else mapBtn.focus({ preventScroll: true });
  };

  experience.onMapFrame((pins, amount) => {
    if (amount < 0.5) return;
    pins.forEach((p, i) => {
      if (railLinks[i]) railLinks[i].style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
    });
  });

  mapBtn.addEventListener('click', () => setMap(!mapOpen));

  // On the map, any in-page link drops you at that stop and zooms back in.
  document.addEventListener('click', (e) => {
    if (!mapOpen) return;
    const link = e.target.closest?.('a[href^="#"]');
    if (!link) return;
    e.preventDefault();
    const id = link.getAttribute('href').slice(1);
    jumpTo(id, 'instant');
    history.replaceState(null, '', `#${id}`);
    updateScroll();
    experience.snapStation();
    setMap(false, { focus: false });
    const heading = document.querySelector(`#${CSS.escape(id)} h1, #${CSS.escape(id)} h2`);
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Don't steal keys from anything being typed into (incl. the chat widget).
    const el = e.composedPath()[0];
    if (el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    if (e.key === 'Escape' && mapOpen) setMap(false);
    else if (e.key.toLowerCase() === 'm') setMap(!mapOpen);
  });

  // Scrolling or swiping on the map means "take me back in".
  window.addEventListener('wheel', (e) => mapOpen && Math.abs(e.deltaY) > 4 && !e.ctrlKey && setMap(false, { focus: false }), { passive: true });
  let touchY = null;
  window.addEventListener('touchstart', (e) => (touchY = mapOpen ? e.touches[0].clientY : null), { passive: true });
  window.addEventListener(
    'touchmove',
    (e) => {
      if (touchY != null && Math.abs(e.touches[0].clientY - touchY) > 60) {
        touchY = null;
        setMap(false, { focus: false });
      }
    },
    { passive: true }
  );
}

// ---------- Cursor: a ring that follows the pointer and names landmarks ----------
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
