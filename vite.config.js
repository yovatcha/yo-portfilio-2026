import { defineConfig } from 'vite';
import projects from './src/projects.json';
import skills from './src/skills.json';
import { renderProjects, renderBubbles } from './src/render.js';

// GEO / SEO: bake the JS-rendered projects & skills into the static HTML so AI
// answer engines and no-JS crawlers can read them. main.js re-renders the same
// markup at runtime (innerHTML), so users see no difference.
const prerenderContent = () => ({
  name: 'prerender-content',
  transformIndexHtml(html) {
    return html
      .replace(
        '<div class="projects" id="projects-grid"></div>',
        `<div class="projects" id="projects-grid">${renderProjects(projects)}</div>`
      )
      .replace(
        '<div class="bubbles" id="bubbles"></div>',
        `<div class="bubbles" id="bubbles">${renderBubbles(skills)}</div>`
      );
  },
});

export default defineConfig({
  base: './',
  // The portrait + any static assets live here and are served from the site root.
  publicDir: 'src/public',
  plugins: [prerenderContent()],
  server: {
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
