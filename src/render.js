// Shared, DOM-free markup builders for the project plates and skill chips.
//
// Single source of truth used in two places:
//   • main.js — sets innerHTML at runtime (users with JS)
//   • vite.config.js — pre-renders the same markup into the static index.html
//     at build time, so AI crawlers / answer engines (GPTBot, PerplexityBot,
//     ClaudeBot) and no-JS clients can read the projects & skills too.
//
// Because main.js overwrites innerHTML with the identical markup on load, the
// pre-rendered content is simply replaced by itself — no duplication.
//
// Keep this file pure (no imports of CSS/DOM) so it can run inside Vite config.

import icons from './skill-icons.js';

export const esc = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const MAX_LEVEL = 5;
const PETAL = 'M0 0C3.5-2.7 3.7-7.8 0-10.8C-3.7-7.8-3.5-2.7 0 0Z';

// A five-petal flower where `level` petals are inked and the rest are ghosts,
// so the skill level reads at a glance. Decorative: the chip's aria-label
// carries the same information as text.
const renderFlower = (level) => {
  const petals = Array.from({ length: MAX_LEVEL }, (_, i) => {
    const on = i < level ? ' is-on' : '';
    return `<g transform="rotate(${i * (360 / MAX_LEVEL)})"><path class="skill__petal${on}" style="--i:${i}" d="${PETAL}"/></g>`;
  }).join('');
  return `<svg class="skill__flower" viewBox="-12 -12 24 24" aria-hidden="true">${petals}<circle class="skill__eye" r="1.9"/></svg>`;
};

// Light brand colours (white marks, JS yellow, React cyan…) vanish on a cream
// tile, so those skills get a navy tile instead.
const isLight = (hex = '') => {
  const [r, g, b] = (hex.replace('#', '').match(/../g) || []).map((c) => parseInt(c, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55;
};

// The tile face: the brand mark from simple-icons, or a typeset monogram from
// `abbr` for skills that have no logo.
const renderLogo = (s) => {
  const path = s.icon && icons[s.icon];
  if (path) {
    return `<svg class="skill__logo" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
  }
  const mono = s.abbr || s.name.slice(0, 2);
  return `<span class="skill__mono" style="--len:${mono.length}" aria-hidden="true">${esc(mono)}</span>`;
};

// A clone is a repeat that only exists to keep the marquee full: hidden from
// screen readers and the tab order, so each skill is announced once.
const renderSkill = (s, clone = false) => {
  const level = Math.min(MAX_LEVEL, Math.max(1, Math.round(s.level ?? 3)));
  const attrs = clone
    ? 'tabindex="-1" aria-hidden="true" data-clone'
    : `tabindex="0" aria-label="${esc(s.name)}, ${level} of ${MAX_LEVEL}"`;
  const logo = s.icon && icons[s.icon];
  const dark = logo && isLight(s.color) ? ' skill--dark' : '';
  const brand = logo && s.color ? ` style="--brand:${esc(s.color)}"` : '';
  return `
          <li class="skill${dark}" ${attrs} data-skill="${esc(s.name)}" data-level="${level}"${brand}>
            ${renderLogo(s)}
            <span class="skill__label">${renderFlower(level)}<span class="skill__name">${esc(s.name)}</span></span>
          </li>`;
};

const EMPTY_TILE = `
          <li class="skill-tile--empty" aria-hidden="true"></li>`;

// Each category is one row of a logo cloud: tiles with blank plates mixed in,
// repeated until the row is long enough to scroll, then doubled so the track
// can loop seamlessly at -50%. Blank placement is deterministic (shifted per
// row) so the build-time and runtime markup match exactly.
const MIN_TILES = 18;
const renderSkillRow = (g, row) => {
  const pass = (clone) =>
    g.skills
      .map((s, j) => renderSkill(s, clone) + ((j + row) % 3 === 1 ? EMPTY_TILE : ''))
      .join('');
  const perPass = g.skills.length + g.skills.filter((_, j) => (j + row) % 3 === 1).length;
  const passes = Math.max(1, Math.ceil(MIN_TILES / perPass));
  const first = pass(false) + pass(true).repeat(passes - 1);
  return `
      <div class="skill-group" data-dir="${row % 2 ? 'right' : 'left'}">
        <h3 class="skill-group__title">${esc(g.group)}</h3>
        <div class="skill-row">
          <div class="skill-track" style="--n:${perPass * passes}">
            <ul class="skill-list">${first}
            </ul>
            <ul class="skill-list" aria-hidden="true" data-clone>${pass(true).repeat(passes)}
            </ul>
          </div>
        </div>
      </div>`;
};

export const renderSkills = (skills) => skills.map(renderSkillRow).join('');

export const renderProjects = (projects) =>
  projects
    .map((p, i) => {
      const tech = (p.tech || []).map((t) => `<li>${esc(t)}</li>`).join('');
      const link = p.link
        ? `<a href="${esc(p.link)}" class="plate__link"${
            p.link.startsWith('http') ? ' target="_blank" rel="noopener"' : ''
          }>View project <span aria-hidden="true">↗</span></a>`
        : '';
      return `
        <article class="plate" data-project="${i}">
          <p class="plate__meta">
            <span class="plate__no">Plate ${String(i + 1).padStart(2, '0')}</span>
            ${p.tag ? `<span class="plate__tag">${esc(p.tag)}</span>` : ''}
          </p>
          <div class="plate__main">
            <h3 class="plate__title">${esc(p.title)}</h3>
            <p class="plate__desc">${esc(p.description)}</p>
          </div>
          <div class="plate__side">
            <ul class="plate__tech">${tech}</ul>
            ${link}
          </div>
        </article>`;
    })
    .join('');
