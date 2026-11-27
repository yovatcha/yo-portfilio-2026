// FAQ as a deck of cards. At rest the cards lie fanned in the middle; picking
// one deals it out large on the right (answer showing), filling most of the
// screen, and shuffles the rest into a tilted stack on the left — a row above
// it on narrow screens.
// JS only decides where each card sits (--x --y --r --s --z) and how big the
// open one is (--w --h); CSS animates it.
// Without JS the cards are a plain grid with every answer showing.

const FAN_R = [-13, -5, 5, 12]; // fan tilt, degrees
const FAN_Y = [26, -6, -10, 22]; // fan arc, px
const STACK_R = [-7, 4, -3, 6]; // stacked tilt
const STACK_X = [-6, 8, -2, 5]; // stacked jitter, px

/** Turn the `.faq-card`s inside `root` into a fanned, dealable deck. */
export function createFaqDeck(root, { reduceMotion = false } = {}) {
  const cards = [...root.querySelectorAll('.faq-card')];
  if (!cards.length) return null;
  const narrow = window.matchMedia('(max-width: 820px)');
  const tilt = reduceMotion ? 0 : 1;
  let active = -1;

  const place = (card, x, y, r, s, z, size) => {
    if (size) {
      card.style.setProperty('--w', `${size[0]}px`);
      card.style.setProperty('--h', `${size[1]}px`);
    } else {
      card.style.removeProperty('--w');
      card.style.removeProperty('--h');
    }
    card.style.setProperty('--x', `${x}px`);
    card.style.setProperty('--y', `${y}px`);
    card.style.setProperty('--r', `${r * tilt}deg`);
    card.style.setProperty('--s', s);
    card.style.setProperty('--z', z);
  };

  const layout = () => {
    const w = root.clientWidth;
    // offset sizes ignore transforms, so a closed card reads its unscaled size
    const base = cards[active === 0 ? 1 : 0];
    const W = base.offsetWidth;
    const H = base.offsetHeight;
    const n = cards.length;
    const vh = window.innerHeight;

    if (active < 0) {
      const s = narrow.matches ? 0.56 : 0.7;
      const spread = Math.min(W * s * 0.55, (w - W * s * 1.15) / (n - 1));
      cards.forEach((card, i) => place(card, (i - (n - 1) / 2) * spread, FAN_Y[i % 4], FAN_R[i % 4], s, i + 1));
      root.style.height = `${H * s + 90}px`;
      return 0;
    }

    const rest = cards.filter((_, i) => i !== active);
    const m = rest.length;

    if (narrow.matches) {
      // a row of small cards on top, the open card below
      const s = 0.3;
      const gap = 28;
      const big = Math.max(H, vh * 0.7);
      const h = H * s + gap + big;
      const spread = W * s * 0.62;
      rest.forEach((card, j) =>
        place(card, (j - (m - 1) / 2) * spread, -h / 2 + (H * s) / 2, STACK_R[j % 4], s, j + 1)
      );
      place(cards[active], 0, -h / 2 + H * s + gap + big / 2, 0, 1, 10, [w, big]);
      root.style.height = `${h}px`;
      return h;
    }

    // a stack on the left; the open card takes the rest of the row and
    // most of the screen's height
    const s = 0.42;
    const gap = 48;
    const big = Math.max(H, Math.min(vh - 180, 46 * 16));
    const bigW = w - W * s - gap;
    const left = -w / 2;
    const step = H * s * 0.5;
    rest.forEach((card, j) =>
      place(card, left + (W * s) / 2 + STACK_X[j % 4], (j - (m - 1) / 2) * step, STACK_R[j % 4], s, j + 1)
    );
    place(cards[active], left + W * s + gap + bigW / 2, 0, 0, 1, 10, [bigW, big]);
    root.style.height = `${big}px`;
    return big;
  };

  // bring the dealt deck to the middle of the screen (below the fixed nav)
  const frame = (h) => {
    const top = root.getBoundingClientRect().top + window.scrollY;
    const nav = 64;
    window.scrollTo({
      top: top - nav - Math.max(0, (window.innerHeight - nav - h) / 2),
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  };

  const sync = () => {
    root.classList.toggle('is-dealt', active >= 0);
    cards.forEach((card, i) => {
      const on = i === active;
      card.classList.toggle('is-active', on);
      card.querySelector('.faq-card__q').setAttribute('aria-expanded', String(on));
      card.querySelector('.faq-card__close').hidden = !on;
      card.querySelector('.faq-card__a').inert = !on;
    });
    return layout();
  };

  const open = (i) => {
    const fresh = active < 0;
    active = i;
    const h = sync();
    if (fresh) frame(h);
    cards[i].querySelector('.faq-card__close').focus({ preventScroll: true });
  };
  const close = () => {
    if (active < 0) return;
    const was = cards[active];
    active = -1;
    sync();
    was.querySelector('.faq-card__q').focus({ preventScroll: true });
  };

  const offs = [];
  const on = (el, type, fn) => {
    el.addEventListener(type, fn);
    offs.push(() => el.removeEventListener(type, fn));
  };

  cards.forEach((card, i) => {
    on(card.querySelector('.faq-card__q'), 'click', () => (i === active ? close() : open(i)));
    on(card.querySelector('.faq-card__close'), 'click', close);
  });
  on(document, 'keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  on(narrow, 'change', layout);
  const ro = new ResizeObserver(layout);
  ro.observe(root);
  offs.push(() => ro.disconnect());

  root.classList.add('faq--deck');
  sync();

  return {
    open,
    close,
    destroy() {
      offs.forEach((off) => off());
      root.classList.remove('faq--deck', 'is-dealt');
      root.style.removeProperty('height');
    },
  };
}
