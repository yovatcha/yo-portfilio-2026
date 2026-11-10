import * as THREE from 'three';

// Anything the visitor can read or click in the HTML layer wins over the room.
const UI_SELECTOR =
  'a, button, input, textarea, select, summary, iframe, .panel, .card, .bubble, .nav, .rail, .dock, .faq__item';

/**
 * Pointer → room interaction. The canvas sits *behind* the HTML, so we listen
 * on window and raycast only when the pointer isn't over real UI.
 *
 * Emits: hover(root|null), press(hit) → return true to start a drag,
 * drag(raycaster), release(), click(root, hit).
 */
export function createPicker({ camera, getTargets, handlers }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2(-10, -10);
  let dirty = false;
  let down = null;
  let dragging = false;
  let hovered = null;

  const toNdc = (e) => {
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  };

  // Walk up to the tagged interactive root (a station group or an orb).
  const rootOf = (obj) => {
    let o = obj;
    while (o) {
      if (o.userData?.station) return o;
      o = o.parent;
    }
    return null;
  };

  const pick = () => {
    const hits = raycaster.intersectObjects(getTargets(), true);
    for (const h of hits) {
      const root = rootOf(h.object);
      if (root) return { root, point: h.point, object: h.object };
    }
    return null;
  };

  const overUi = (e) => e.target instanceof Element && e.target.closest(UI_SELECTOR);

  function onMove(e) {
    toNdc(e);
    if (dragging) {
      handlers.drag(raycaster);
      return;
    }
    if (overUi(e)) {
      ndc.set(-10, -10);
    }
    dirty = true;
  }

  function onDown(e) {
    if (e.button !== 0 || overUi(e)) return;
    toNdc(e);
    const hit = pick();
    down = { x: e.clientX, y: e.clientY, hit };
    if (hit && handlers.press(hit)) {
      dragging = true;
      document.body.classList.add('is-grabbing');
    }
  }

  function onUp(e) {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (dragging) {
      dragging = false;
      document.body.classList.remove('is-grabbing');
      handlers.release();
    }
    if (moved < 6 && down.hit) handlers.click(down.hit.root, down.hit);
    down = null;
  }

  // On touch, grabbing an orb must not scroll the page.
  function onTouchStart(e) {
    if (overUi(e) || e.touches.length !== 1) return;
    const t = e.touches[0];
    toNdc(t);
    const hit = pick();
    if (hit?.root.userData.orb) e.preventDefault();
  }

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('touchstart', onTouchStart, { passive: false });

  return {
    ndc,
    // Called once per frame; raycasts only when the pointer moved.
    update(force = false) {
      if (dragging || (!dirty && !force)) return hovered;
      dirty = false;
      if (ndc.x < -2) {
        if (hovered) handlers.hover((hovered = null));
        return hovered;
      }
      raycaster.setFromCamera(ndc, camera);
      const root = pick()?.root ?? null;
      if (root !== hovered) handlers.hover((hovered = root));
      return hovered;
    },
    get dragging() {
      return dragging;
    },
    dispose() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('touchstart', onTouchStart);
    },
  };
}
