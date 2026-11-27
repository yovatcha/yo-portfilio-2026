// Seeded randomness for the garden.
//
// Every visit gets a new 24-bit seed, shown on the page as the "edition"
// number. The same seed always grows the same opening arrangement, so
// `?seed=4F2A91` in the URL brings a particular garden back.

const MASK = 0xffffff;

export function randomSeed() {
  if (globalThis.crypto?.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0] & MASK;
  }
  return Math.floor(Math.random() * (MASK + 1));
}

export const formatSeed = (seed) => (seed & MASK).toString(16).toUpperCase().padStart(6, '0');

/** Reads `?seed=` — six hex digits as printed on the page, or any word (hashed). */
export function seedFromUrl(search = globalThis.location?.search ?? '') {
  const raw = new URLSearchParams(search).get('seed')?.trim();
  if (!raw) return null;
  if (/^[0-9a-f]{1,6}$/i.test(raw)) return parseInt(raw, 16);
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) & MASK;
}

/** mulberry32: tiny, fast, and good enough for arranging flowers. Returns () => [0, 1). */
export function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
