import { defineConfig } from 'vite';
import projects from './src/projects.json';
import skills from './src/skills.json';
import { renderProjects, renderSkills } from './src/render.js';

// GEO / SEO: bake the JS-rendered projects & skills into the static HTML so AI
// answer engines and no-JS crawlers can read them. main.js re-renders the same
// markup at runtime (innerHTML), so users see no difference.
const SLOTS = [
  ['<div class="plates" id="projects-grid"></div>', () => `<div class="plates" id="projects-grid">${renderProjects(projects)}</div>`],
  ['<div class="skills" id="skills-grid"></div>', () => `<div class="skills" id="skills-grid">${renderSkills(skills)}</div>`],
];

const prerenderContent = () => ({
  name: 'prerender-content',
  transformIndexHtml(html) {
    return SLOTS.reduce((out, [slot, fill]) => {
      // Fail loudly: a renamed placeholder would otherwise silently ship empty sections to crawlers.
      if (!out.includes(slot)) throw new Error(`prerender-content: placeholder not found in index.html: ${slot}`);
      return out.replace(slot, fill);
    }, html);
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
