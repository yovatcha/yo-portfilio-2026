// Shared, DOM-free markup builders for the projects grid and skill bubbles.
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

export const esc = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const SIZE_BY_LEVEL = { 1: 46, 2: 56, 3: 68, 4: 82, 5: 98 };

const renderBubble = (s) => {
  const size = s.size ?? SIZE_BY_LEVEL[s.level] ?? 90;
  const color = s.color ?? '#7c5cff';
  const inner = s.icon
    ? `<img class="bubble__logo" src="https://cdn.simpleicons.org/${esc(s.icon)}/white" alt="" aria-hidden="true" loading="lazy" />`
    : `<span class="bubble__abbr">${esc(s.abbr || s.name)}</span>`;
  return `
        <div class="bubble" style="--size:${size}px;--c:${color}" tabindex="0" aria-label="${esc(s.name)}">
          ${inner}
          <span class="bubble__name">${esc(s.name)}</span>
        </div>`;
};

export const renderBubbles = (skills) =>
  skills
    .map(
      (g) => `
      <div class="skill-group">
        <h3 class="skill-group__title">${esc(g.group)}</h3>
        <div class="bubbles__cloud">${g.skills.map(renderBubble).join('')}</div>
      </div>`
    )
    .join('');

export const renderProjects = (projects) =>
  projects
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
