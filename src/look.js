// A "look" is plain JSON describing everything the user customised. The scene is
// always derived from it, which makes undo/redo, autosave and sharing trivial.
import { SKIN_TONES, HAIR_COLORS, CLOTH_COLORS, BODY_SLIDERS, HEIGHT_RANGE } from './config.js';

export const emptyLook = () => ({
  v: 1,
  materials: {},      // key -> { color?, roughness?, metalness? }
  hiddenParts: [],    // mesh keys
  body: { height: 1, sliders: {} },
  roles: {},          // role -> bone name overrides (Rig section)
  facing: 'z+',       // which way the model looks: 'z+' (glTF default) or 'z-'
  accessories: [],    // { uid, item, name, bone, pos, rot(deg), scl, visible, colors: { partName: '#rrggbb' } }
});

export function sanitizeLook(raw) {
  const look = emptyLook();
  if (!raw || typeof raw !== 'object') return look;
  if (raw.materials && typeof raw.materials === 'object') look.materials = raw.materials;
  if (Array.isArray(raw.hiddenParts)) look.hiddenParts = raw.hiddenParts.map(String);
  if (raw.body) {
    look.body.height = Number(raw.body.height) || 1;
    look.body.sliders = { ...(raw.body.sliders || {}) };
  }
  if (raw.roles && typeof raw.roles === 'object') look.roles = { ...raw.roles };
  if (raw.facing === 'z-') look.facing = 'z-';
  if (Array.isArray(raw.accessories)) {
    look.accessories = raw.accessories
      .filter((a) => a && a.item && Array.isArray(a.pos) && Array.isArray(a.rot) && Array.isArray(a.scl))
      .map(({ tint, ...a }) => ({ ...a, colors: a.colors && typeof a.colors === 'object' ? a.colors : {} })); // `tint` (one colour for the whole item) was replaced by per-part colours
  }
  return look;
}

export const uid = () => Math.random().toString(36).slice(2, 10);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const between = (a, b) => a + Math.random() * (b - a);

function randomColor() {
  const c = `hsl(${Math.floor(Math.random() * 360)}, ${Math.floor(between(35, 80))}%, ${Math.floor(between(30, 65))}%)`;
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.fillStyle = c;
  return ctx.fillStyle; // normalised to #rrggbb
}

export const isSkinName = (n) => /skin|body|face|head|flesh/i.test(n);
export const isHairName = (n) => /hair|brow|beard|lash/i.test(n);

/** Randomise colours and proportions; accessories are left to the caller. */
export function randomizeLook(look, character) {
  const next = JSON.parse(JSON.stringify(look));
  for (const m of character.materialList) {
    if (!m.material.color) continue;
    const color = isSkinName(m.key) ? pick(SKIN_TONES)
      : isHairName(m.key) ? pick(HAIR_COLORS)
        : Math.random() < 0.5 ? pick(CLOTH_COLORS) : randomColor();
    next.materials[m.key] = { ...(next.materials[m.key] || {}), color };
  }
  next.body.height = Math.round(between(0.92, 1.1) * 100) / 100;
  for (const s of BODY_SLIDERS) {
    next.body.sliders[s.id] = Math.round(between(Math.max(s.min, 0.9), Math.min(s.max, 1.15)) * 100) / 100;
  }
  next.body.height = Math.min(Math.max(next.body.height, HEIGHT_RANGE.min), HEIGHT_RANGE.max);
  return next;
}
