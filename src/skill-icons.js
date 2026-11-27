// Brand marks for the skill cloud, keyed by the `icon` slug in skills.json.
// Named imports only, so the bundle carries just these paths and not the
// whole simple-icons library. Pure data: render.js uses it at build time too.
import {
  siDocker,
  siExpress,
  siFigma,
  siFlutter,
  siGo,
  siHtml5,
  siJavascript,
  siKubernetes,
  siLinux,
  siNextdotjs,
  siNodedotjs,
  siPostgresql,
  siPrisma,
  siReact,
  siRubyonrails,
  siShadcnui,
  siTailwindcss,
  siThreedotjs,
  siTypescript,
} from 'simple-icons';

export default Object.fromEntries(
  [
    siDocker,
    siExpress,
    siFigma,
    siFlutter,
    siGo,
    siHtml5,
    siJavascript,
    siKubernetes,
    siLinux,
    siNextdotjs,
    siNodedotjs,
    siPostgresql,
    siPrisma,
    siReact,
    siRubyonrails,
    siShadcnui,
    siTailwindcss,
    siThreedotjs,
    siTypescript,
  ].map((icon) => [icon.slug, icon.path])
);
