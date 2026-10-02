// Edit these to customise the app.

export const APP_TITLE = 'Character Creator';

// Two editions of the app, picked by the Vite mode: `vite build` (and the GitHub Pages deploy) is the
// production edition, `vite` (npm run dev) is the dev edition. Production edits only the default
// character: no uploading characters, no adding / removing / editing animations. That keeps the
// exported model in sync with what the city-scape expects from it.
export const IS_PRODUCTION = import.meta.env.MODE === 'production';

// URLs are relative to the page, so the site works under any subpath.
export const DEFAULT_CHARACTER_URL = 'characters/default.glb'; // the character the production edition edits
export const TEMPLATE_URLS = ['models/character.glb', 'models/character.gltf']; // dev only: your own template (first that exists), tried before the default
export const PLACEHOLDER_URL = 'models/placeholder.glb'; // generated stand-in (npm run placeholder)
export const MANIFEST_URL = 'assets/manifest.json';      // accessory catalog

// Accessory sizes/offsets are authored for a character this tall (in metres).
// They are rescaled automatically for taller / shorter template characters.
export const REF_HEIGHT = 1.8;

// Exports are decimated to about this many triangles in total (a character that is already lighter
// is left alone). The error limits (relative to mesh size) are tried in order until the budget is met.
export const EXPORT_MAX_TRIANGLES = 10000;
export const SIMPLIFY_ERRORS = [0.02, 0.05, 0.1];

export const SIZE_WARN_BYTES = 20 * 1024 * 1024;
export const DEFAULT_EXPORT_NAME = 'character.glb';
export const STORAGE_KEY = 'character-creator:look:v1';

// Bones are found by parsing their names into { part, side, number }: "mixamorig:LeftHand",
// "hand.L", "Hand_L" and "arm_right_2" all work. A role lists the `parts` it accepts in
// priority order, the `side` ('L' / 'R' / none) and `fallback` roles to use when no bone
// matches (e.g. a rig without hand bones holds things by the forearm / upper arm).
// If a role is still wrong for your rig, pick the right bone in the Rig section of the app,
// or add synonyms here. Catalog items refer to roles ("head") or exact bone names.
const sided = (name, parts, fallback = []) => ({
  [`${name}L`]: { parts, side: 'L', fallback: fallback.map((f) => `${f}L`) },
  [`${name}R`]: { parts, side: 'R', fallback: fallback.map((f) => `${f}R`) },
});
export const BONE_ROLES = {
  hips: { parts: ['hips', 'pelvis', 'hip'], fallback: ['spine'] },
  spine: { parts: ['spine', 'backbone'], fallback: ['hips'] },
  chest: { parts: ['chest', 'upperchest', 'backbone', 'spine'], pick: 'high', fallback: ['spine', 'hips'] },
  neck: { parts: ['neck'], fallback: ['chest'] },
  head: { parts: ['head'], fallback: ['neck', 'chest'] },
  ...sided('shoulder', ['shoulder', 'clavicle', 'collar'], ['chest']),
  ...sided('upperArm', ['upperarm', 'uparm', 'arm'], ['shoulder']),
  ...sided('foreArm', ['forearm', 'lowerarm', 'downarm'], ['upperArm']),
  ...sided('hand', ['hand', 'wrist'], ['foreArm']),
  ...sided('upLeg', ['upleg', 'upperleg', 'thigh', 'hip'], ['hips']),
  ...sided('lowLeg', ['lowerleg', 'lowleg', 'calf', 'shin', 'leg'], ['upLeg']),
  ...sided('foot', ['foot', 'ankle'], ['lowLeg']),
};

// Roles shown in the Rig section (label, role).
export const RIG_ROLES = [
  ['Head', 'head'], ['Chest / back', 'chest'], ['Hips', 'hips'],
  ['Upper arm L', 'upperArmL'], ['Upper arm R', 'upperArmR'], ['Hand L', 'handL'], ['Hand R', 'handR'],
  ['Upper leg L', 'upLegL'], ['Upper leg R', 'upLegR'], ['Foot L', 'footL'], ['Foot R', 'footR'],
];

// Proportion sliders. Each scales the listed bones (the scale cascades to their
// children, so "arms" scales the whole arm incl. the hand). Sliders whose bones are
// not found in the template are hidden.
export const BODY_SLIDERS = [
  { id: 'head', label: 'Head size', roles: ['head'], min: 0.8, max: 1.35 },
  { id: 'arms', label: 'Arm size', roles: ['upperArmL', 'upperArmR'], min: 0.8, max: 1.3 },
  { id: 'hands', label: 'Hand size', roles: ['handL', 'handR'], min: 0.7, max: 1.6 },
  { id: 'legs', label: 'Leg size', roles: ['upLegL', 'upLegR'], min: 0.8, max: 1.3 },
  { id: 'feet', label: 'Foot size', roles: ['footL', 'footR'], min: 0.7, max: 1.5 },
];
export const HEIGHT_RANGE = { min: 0.8, max: 1.25 };

export const SKIN_TONES = ['#ffdfc4', '#f0c8a0', '#e0ac7e', '#c68642', '#a1665e', '#8d5524', '#6b4226', '#3b2219'];
export const HAIR_COLORS = ['#0b0b0d', '#3b2a20', '#6a4a2f', '#a56b3c', '#d8b26a', '#e8e0c8', '#b3322c', '#4a6fd8', '#8a4fd0', '#d94f9a'];
export const CLOTH_COLORS = ['#f2f2f2', '#2b2f3a', '#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#16a085', '#2980b9', '#8e44ad', '#7f8c8d'];

export const BACKGROUNDS = ['#1b1e24', '#2d3340', '#0e1014', '#d9dde3', '#f4efe6', '#3a6b5a', '#5a3a6b'];

// Roles mapped when retargeting animation from another skeleton (FBX, Mixamo, ...).
export const RETARGET_ROLES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'shoulderR', 'upperArmL', 'upperArmR', 'foreArmL', 'foreArmR', 'handL', 'handR',
  'upLegL', 'upLegR', 'lowLegL', 'lowLegR', 'footL', 'footR',
];
