import './style.css';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

import {
  APP_TITLE, IS_PRODUCTION, EXPORT_MAX_TRIANGLES, DEFAULT_CHARACTER_URL, TEMPLATE_URLS, PLACEHOLDER_URL, SIZE_WARN_BYTES, DEFAULT_EXPORT_NAME, STORAGE_KEY,
  SKIN_TONES, HAIR_COLORS, CLOTH_COLORS, BACKGROUNDS, HEIGHT_RANGE, RIG_ROLES,
} from './config.js';
import { $, $$, h, toast, download, mb, DEG, RAD, round } from './util.js';
import { History } from './history.js';
import { createViewer } from './viewer.js';
import { Character, parseModel, loadModelUrl, isModelFile } from './character.js';
import { Animator } from './animation.js';
import { prepareClips } from './retarget.js';
import { Catalog, AccessoryManager } from './accessories.js';
import { emptyLook, sanitizeLook, randomizeLook, isSkinName, isHairName } from './look.js';
import { exportCharacter, exportStats } from './exporter.js';
import { thumbnail } from './thumbs.js';

/* ------------------------------------------------------------------ state */

const viewer = createViewer($('#canvas'), $('#viewport'));
const catalog = new Catalog();
let character = null;
let animator = null;
let manager = null;
let look = emptyLook();
let lastJson = JSON.stringify(look);
let history = new History(syncHistoryButtons);
let selectedUid = null;
let activeTab = 'look';
let category = 'All';
let uniformScale = true;
let includeAnimations = true;
let transparentShot = false;
let exportStatus = '';
let scrubbing = false;
let showSkeleton = false;
let skeletonHelper = null;
const thumbCache = new Map();
const studio = { bg: BACKGROUNDS[0], turntable: false, stage: true };
let propInputs = null;

const entry = (uid = selectedUid) => look.accessories.find((a) => a.uid === uid) || null;

/* ---------------------------------------------------------------- gizmo */

const tc = new TransformControls(viewer.camera, viewer.renderer.domElement);
tc.setSpace('local');
viewer.scene.add(tc.getHelper());
tc.addEventListener('dragging-changed', (e) => { viewer.orbit.enabled = !e.value; });
const selBox = new THREE.BoxHelper(new THREE.Object3D(), 0xffcc00);
selBox.visible = false;
viewer.scene.add(selBox);

let dragging = false;
tc.addEventListener('dragging-changed', (e) => {
  dragging = e.value;
  if (!e.value) { // drag finished: store the live transform in the look
    const en = entry();
    const t = en && manager.readTransform(en.uid);
    if (t) { Object.assign(en, t); commit(); }
  }
});
tc.addEventListener('objectChange', () => {
  const en = entry();
  if (!en) return;
  const o = tc.object;
  if (tc.mode === 'scale' && uniformScale) { // keep proportions
    const s = o.scale, r = [s.x / en.scl[0], s.y / en.scl[1], s.z / en.scl[2]];
    const f = r.reduce((best, x) => (Math.abs(x - 1) > Math.abs(best - 1) ? x : best), 1);
    o.scale.set(en.scl[0] * f, en.scl[1] * f, en.scl[2] * f);
  }
  refreshTransformInputs();
});

function attachGizmo() {
  const obj = selectedUid && manager ? manager.object(selectedUid) : null;
  if (obj && obj.visible) {
    if (tc.object !== obj) tc.attach(obj);
    selBox.visible = true;
  } else {
    tc.detach();
    selBox.visible = false;
  }
}

function setMode(mode) {
  tc.setMode(mode);
  $$('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
}

/* ------------------------------------------------------------ look + undo */

function syncHistoryButtons() {
  $('#b-undo').disabled = !history.canUndo;
  $('#b-redo').disabled = !history.canRedo;
}

const persistable = () => ({ ...look, accessories: look.accessories.filter((a) => !a.item.startsWith('custom:')) });

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable())); } catch { /* storage unavailable */ }
}

/** Push the current look onto the undo stack (no-op if nothing changed). */
function commit() {
  const json = JSON.stringify(look);
  if (json === lastJson) { renderAll(); return; }
  const prev = lastJson;
  lastJson = json;
  history.push({ undo: () => restore(prev), redo: () => restore(json) });
  save();
  renderAll();
}

function restore(json) {
  lastJson = json;
  look = sanitizeLook(JSON.parse(json));
  if (selectedUid && !entry()) selectedUid = null;
  applyLook();
  save();
  renderAll();
}

/** Re-derive the scene from `look`. Cheap enough to call on every slider tick. */
function applyLook() {
  if (!character) return;
  character.applyLook(look);
  manager.facing = look.facing;
  manager.sync(look.accessories).then(() => {
    attachGizmo();
    // The colour list of a freshly equipped accessory is only known once it has loaded.
    const en = entry();
    if (en && renderedParts !== `${en.uid}:${manager.parts(en.uid).length}`) renderRight();
  });
  attachGizmo();
}

function setLook(next) {
  look = sanitizeLook(next);
  if (selectedUid && !entry()) selectedUid = null;
  applyLook();
  commit();
}

/* -------------------------------------------------------------- character */

async function setCharacter(gltf, name) {
  if (character) viewer.scene.remove(character.scene);
  if (skeletonHelper) { viewer.scene.remove(skeletonHelper); skeletonHelper = null; }
  tc.detach();
  character = new Character(gltf, name);
  if (!character.bones.length) toast('This model has no skeleton: it can be styled but not animated.', 'warn', 8000);
  viewer.scene.add(character.scene);
  viewer.fitStage(character.box);
  viewer.frameBox(character.box);
  updateSkeletonHelper();
  reportRig();
  animator = new Animator(character);
  animator.onChange = onAnimatorChange;
  manager = new AccessoryManager(character, catalog);
  selectedUid = null;
  history = new History(syncHistoryButtons);
  look.accessories = look.accessories.filter((a) => catalog.get(a.item));
  lastJson = JSON.stringify(look);
  exportStatus = '';
  $('#empty').hidden = true;
  $('#char-name').textContent = name;
  applyLook();
  const idle = animator.clips.find((c) => /idle/i.test(c.clip.name));
  if (idle) animator.play(idle.id);
  syncHistoryButtons();
  renderAll();
  renderTransport();
  return true;
}

/* ------------------------------------------------------------ accessories */

function equip(item) {
  if (!manager) return;
  const entries = manager.entriesFor(item);
  look.accessories.push(...entries);
  selectedUid = entries[0].uid;
  applyLook();
  commit();
}

function removeAccessory(uid = selectedUid) {
  if (!entry(uid)) return;
  look.accessories = look.accessories.filter((a) => a.uid !== uid);
  if (selectedUid === uid) selectedUid = null;
  applyLook();
  commit();
}

function duplicateAccessory(uid = selectedUid) {
  const en = entry(uid);
  if (!en) return;
  const copy = { ...JSON.parse(JSON.stringify(en)), uid: Math.random().toString(36).slice(2, 10) };
  copy.pos[0] += 0.03;
  look.accessories.push(copy);
  selectedUid = copy.uid;
  applyLook();
  commit();
}

function mirrorAccessory() {
  const en = entry();
  const m = en && manager.mirrorOf(en);
  if (!m) { toast('No matching bone on the opposite side found.', 'warn'); return; }
  look.accessories.push(m);
  selectedUid = m.uid;
  applyLook();
  commit();
}

function resetPlacement() {
  const en = entry();
  const item = en && catalog.get(en.item);
  if (!item) return;
  const [d] = manager.entriesFor(item);
  Object.assign(en, { bone: d.bone, anchor: d.anchor, fit: d.fit, pos: d.pos, rot: d.rot, scl: d.scl });
  applyLook();
  commit();
}

function select(uid) {
  selectedUid = uid;
  attachGizmo();
  renderAll();
}

/* -------------------------------------------------------------- UI pieces */

const section = (title, ...kids) => h('div', { class: 'section' }, title && h('h2', {}, title), ...kids);

function slider({ label, min, max, step, value, onInput, onChange, fmt = (v) => round(v, 2) }) {
  const val = h('span', { class: 'val' }, fmt(value));
  const input = h('input', {
    type: 'range', min, max, step, value,
    oninput: (e) => { const v = parseFloat(e.target.value); val.textContent = fmt(v); onInput(v); },
    onchange: () => onChange?.(),
  });
  return h('div', { class: 'slider' }, h('span', {}, label), val, input);
}

function chips(colors, onPick) {
  return h('div', { class: 'chips' }, colors.map((c) =>
    h('button', { class: 'chip', style: `background:${c}`, title: c, onclick: () => onPick(c) })));
}

function materialRow(m) {
  const v = look.materials[m.key] || {};
  const patch = (p) => { look.materials[m.key] = { ...(look.materials[m.key] || {}), ...p }; character.applyLook(look); };
  const palette = isSkinName(m.key) ? SKIN_TONES : isHairName(m.key) ? HAIR_COLORS : CLOTH_COLORS;
  const finish = [];
  if (m.orig.roughness !== undefined) {
    finish.push(slider({ label: 'Roughness', min: 0, max: 1, step: 0.01, value: v.roughness ?? m.orig.roughness, onInput: (x) => patch({ roughness: x }), onChange: commit }));
  }
  if (m.orig.metalness !== undefined) {
    finish.push(slider({ label: 'Metalness', min: 0, max: 1, step: 0.01, value: v.metalness ?? m.orig.metalness, onInput: (x) => patch({ metalness: x }), onChange: commit }));
  }
  return h('div', { class: 'mat' },
    h('div', { class: 'mat-head' },
      h('input', { type: 'color', value: v.color ?? m.orig.color, oninput: (e) => patch({ color: e.target.value }), onchange: commit }),
      h('span', { class: 'mat-name', title: m.key }, m.key),
      h('button', { class: 'ib', title: 'Reset this material', onclick: () => { delete look.materials[m.key]; character.applyLook(look); commit(); } }, '↺')),
    chips(palette, (c) => { patch({ color: c }); commit(); }),
    finish.length ? h('details', {}, h('summary', {}, 'Finish'), ...finish) : null);
}

function updateSkeletonHelper() {
  if (skeletonHelper) { viewer.scene.remove(skeletonHelper); skeletonHelper = null; }
  if (!showSkeleton || !character) return;
  skeletonHelper = new THREE.SkeletonHelper(character.scene);
  skeletonHelper.material.depthTest = false;
  skeletonHelper.material.transparent = true;
  skeletonHelper.renderOrder = 10;
  viewer.scene.add(skeletonHelper);
}

/** Tell the user when roles had to be guessed, since that decides where accessories attach. */
function reportRig() {
  const rep = character.roleReport(RIG_ROLES);
  const missing = rep.filter((r) => !r.bone).map((r) => r.label);
  const guessed = rep.filter((r) => r.how.startsWith('fallback'));
  if (missing.length) toast(`Bones not found for: ${missing.join(', ')}. Accessories for these attach to the body instead. Choose bones in the Rig section (Look tab).`, 'warn', 12000);
  else if (guessed.length) toast(`No bone named for ${guessed.map((r) => r.label).join(', ')}: using ${guessed.length > 1 ? 'nearby bones' : 'a nearby bone'} instead. Check the Rig section (Look tab).`, 'info', 9000);
}

function renderRigSection() {
  const rep = character.roleReport(RIG_ROLES);
  const names = character.bones.map((b) => b.name);
  const rows = rep.map((r) => {
    const status = r.how === 'name' ? '' : r.how === 'override' ? ' (set)' : r.bone ? ` (via ${r.how.split(':')[1]})` : ' (not found)';
    const select = h('select', { class: r.bone && r.how === 'name' ? '' : 'warnsel', onchange: (e) => {
      if (e.target.value) look.roles = { ...look.roles, [r.role]: e.target.value };
      else { look.roles = { ...look.roles }; delete look.roles[r.role]; }
      applyLook(); commit();
    } },
    h('option', { value: '' }, `Auto: ${r.bone ? r.bone.name : '-'}${status}`),
    names.map((n) => h('option', { value: n, selected: look.roles[r.role] === n }, n)));
    return h('label', { class: 'field' }, h('span', {}, r.label), select);
  });
  return section('Rig',
    h('p', { class: 'hint' }, `${character.bones.length} bones. Accessories attach to these. Fix any that look wrong; existing accessories keep their bone (change it in the accessory panel).`),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: showSkeleton, onchange: (e) => { showSkeleton = e.target.checked; updateSkeletonHelper(); } }), 'Show skeleton'),
    h('label', { class: 'field' }, h('span', {}, 'Character faces'),
      h('select', { onchange: (e) => { look.facing = e.target.value; applyLook(); commit(); } },
        h('option', { value: 'z+', selected: look.facing === 'z+' }, '+Z (glTF default)'),
        h('option', { value: 'z-', selected: look.facing === 'z-' }, '−Z (turned around)'))),
    h('details', {}, h('summary', {}, 'Bone mapping'), h('div', { class: 'section', style: 'margin-top:8px' }, rows)));
}

function renderLookTab() {
  const el = h('div', { id: 'tab-look', class: 'section' });
  const mats = character.materialList.filter((m) => m.material.color);
  el.append(section('Colours', mats.length ? mats.map(materialRow) : h('p', { class: 'hint' }, 'No colourable materials.')));

  if (character.meshes.length > 1) {
    el.append(section('Parts',
      h('p', { class: 'hint' }, 'Show or hide meshes of the template (hairstyles, clothes, ...).'),
      h('ul', { class: 'list' }, character.meshes.map(({ key }) => {
        const hidden = look.hiddenParts.includes(key);
        return h('li', { class: hidden ? 'dim' : '', onclick: () => {
          look.hiddenParts = hidden ? look.hiddenParts.filter((k) => k !== key) : [...look.hiddenParts, key];
          applyLook(); commit();
        } }, h('span', { class: 'ib' }, hidden ? '🚫' : '👁'), h('span', { class: 'name' }, key));
      }))));
  }

  const sliders = character.availableSliders();
  el.append(section('Body',
    slider({ label: 'Height', ...HEIGHT_RANGE, step: 0.01, value: look.body.height, onInput: (v) => { look.body.height = v; applyLook(); }, onChange: commit }),
    ...sliders.map((s) => slider({
      label: s.label, min: s.min, max: s.max, step: 0.01, value: look.body.sliders[s.id] ?? 1,
      onInput: (v) => { look.body.sliders[s.id] = v; applyLook(); }, onChange: commit,
    })),
    h('button', { onclick: () => { look.body = { height: 1, sliders: {} }; applyLook(); commit(); } }, 'Reset proportions'),
    h('p', { class: 'hint' }, 'Proportions are saved as bone scales, so exported animations still work.')));
  el.append(renderRigSection());
  return el;
}

function thumbFor(item) {
  const make = (url) => h('img', { src: url, alt: item.name });
  if (thumbCache.has(item.id)) return make(thumbCache.get(item.id));
  const ph = h('div', { class: 'ph' });
  catalog.instantiate(item).then((obj) => {
    const s = Array.isArray(item.scale) ? item.scale : [item.scale, item.scale, item.scale];
    obj.scale.fromArray(s);
    const wrap = new THREE.Group();
    wrap.add(obj);
    const url = thumbnail(wrap);
    thumbCache.set(item.id, url);
    ph.replaceWith(make(url)); // no-op if the panel was re-rendered meanwhile; the cache serves the next render
  }).catch(() => {});
  return ph;
}

function renderAccessoriesTab() {
  const cats = ['All', ...catalog.categories];
  const items = catalog.items.filter((i) => category === 'All' || i.category === category);
  const el = h('div', { class: 'section' });
  el.append(
    section('Catalog',
      h('div', { class: 'chiprow' }, cats.map((c) => h('button', { class: `pill ${c === category ? 'active' : ''}`, onclick: () => { category = c; renderLeft(); } }, c))),
      h('div', { class: 'grid' }, items.map((item) => h('div', { class: 'card-item', title: item.builtin ? 'Placeholder accessory' : item.name, onclick: () => equip(item) },
        thumbFor(item), h('span', {}, item.name)))),
      h('button', { onclick: () => $('#f-acc').click() }, 'Add your own .glb / .gltf…'),
      h('p', { class: 'hint' }, 'Custom models last for this session only. Add permanent ones in public/assets/manifest.json.')),
    section('Equipped',
      look.accessories.length ? h('ul', { class: 'list' }, look.accessories.map((a) => h('li', { class: `${a.uid === selectedUid ? 'sel' : ''} ${a.visible === false ? 'dim' : ''}`, onclick: () => select(a.uid) },
        h('span', { class: 'name' }, a.name, h('span', { class: 'sub' }, `  ${a.bone.replace(/^mixamorig[:_]?/i, '')}`)),
        h('button', { class: 'ib', title: a.visible === false ? 'Show' : 'Hide', onclick: (e) => { e.stopPropagation(); a.visible = a.visible === false; applyLook(); commit(); } }, a.visible === false ? '🚫' : '👁'),
        h('button', { class: 'ib', title: 'Remove', onclick: (e) => { e.stopPropagation(); removeAccessory(a.uid); } }, '✕'))))
        : h('p', { class: 'hint' }, 'Nothing equipped yet. Click an item above.')));
  return el;
}

const fmtTime = (t) => t.toFixed(2);

function renderAnimateTab() {
  const el = h('div', { class: 'section' });
  const list = animator.clips.length
    ? h('ul', { class: 'list' }, animator.clips.map((c) => h('li', { class: c.id === animator.currentId ? 'sel' : '', onclick: () => animator.play(c.id) },
      h('span', { class: 'name', title: c.source }, c.clip.name || '(unnamed)', h('span', { class: 'sub' }, `  ${fmtTime(c.clip.duration)}s`)),
      c.retargeted ? h('span', { class: 'sub', title: 'Retargeted from another skeleton' }, '⇄') : null,
      c.coverage < 0.5 ? h('span', { class: 'warn', title: `Only ${Math.round(c.coverage * 100)}% of tracks match this skeleton` }, '⚠') : null,
      h('label', { class: 'check', title: 'Include in export', onclick: (e) => e.stopPropagation() },
        h('input', { type: 'checkbox', checked: c.exportOn, onchange: (e) => { c.exportOn = e.target.checked; renderRight(); } })))))
    : h('p', { class: 'hint' }, 'This template has no animations. Add some below.');
  el.append(
    section('Clips', list,
      h('button', { onclick: () => $('#f-anim').click() }, 'Add animation files (.fbx / .glb)…'),
      h('p', { class: 'hint' }, 'Add .fbx, .glb or .gltf animation files (e.g. Mixamo "without skin"). If their skeleton differs from the template, they are retargeted by body part (hips, arms, legs, head, ...); ⇄ marks those. The checkbox picks which clips are exported.')),
    section('Playback',
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: animator.inPlace, onchange: (e) => animator.setInPlace(e.target.checked) }), 'In place (remove root motion)'),
      h('button', { onclick: () => animator.stop() }, 'Stop / rest pose')));
  return el;
}

function renderStudioTab() {
  return h('div', { class: 'section' },
    section('Background',
      h('div', { class: 'chips' }, BACKGROUNDS.map((c) => h('button', { class: 'chip', style: `background:${c}`, title: c, onclick: () => { studio.bg = c; viewer.setBackground(c); } })),
        h('input', { type: 'color', value: studio.bg, oninput: (e) => { studio.bg = e.target.value; viewer.setBackground(e.target.value); } }))),
    section('Lighting',
      h('div', { class: 'chiprow' }, ['studio', 'day', 'night'].map((n) =>
        h('button', { class: `pill ${viewer.lighting === n ? 'active' : ''}`, onclick: () => { viewer.setLighting(n); renderLeft(); } }, n)))),
    section('View',
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: studio.turntable, onchange: (e) => { studio.turntable = e.target.checked; viewer.setAutoRotate(e.target.checked); } }), 'Turntable'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: studio.stage, onchange: (e) => { studio.stage = e.target.checked; viewer.setStageVisible(e.target.checked); } }), 'Floor shadow & disc')),
    section('Screenshot',
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: transparentShot, onchange: (e) => { transparentShot = e.target.checked; } }), 'Transparent background'),
      h('button', { onclick: takeScreenshot }, 'Save PNG')));
}

async function takeScreenshot() {
  const blob = await viewer.screenshot({ transparent: transparentShot, hide: [tc.getHelper(), selBox, ...(skeletonHelper ? [skeletonHelper] : [])] });
  download(blob, 'character.png');
}

const TABS = [['look', 'Look'], ['acc', 'Accessories'], ['anim', 'Animate'], ['studio', 'Studio']]
  .filter(([id]) => !(IS_PRODUCTION && id === 'anim')); // production has fixed animations: no panel

function renderLeft() {
  $('#tabs').replaceChildren(...TABS.map(([id, label]) =>
    h('button', { class: id === activeTab ? 'active' : '', onclick: () => { activeTab = id; renderLeft(); } }, label)));
  const body = $('#tab-body');
  if (!character) { body.replaceChildren(h('p', { class: 'hint' }, 'Load a character to start.')); return; }
  const view = { look: renderLookTab, acc: renderAccessoriesTab, anim: renderAnimateTab, studio: renderStudioTab }[activeTab]();
  body.replaceChildren(view);
}

/* ------------------------------------------------------- properties panel */

function xformRow(label, key, step) {
  const inputs = [0, 1, 2].map((axis) => h('input', {
    type: 'number', step,
    onchange: (e) => {
      const en = entry();
      let v = parseFloat(e.target.value);
      if (!en || !Number.isFinite(v)) { refreshTransformInputs(); return; }
      if (key === 'scl') {
        if (Math.abs(v) < 0.001) v = 0.001 * Math.sign(en.scl[axis] || 1);
        if (uniformScale) { const f = v / (en.scl[axis] || 1); en.scl = en.scl.map((x) => x * f); } else en.scl[axis] = v;
      } else en[key][axis] = v;
      applyLook();
      commit();
    },
    onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); },
  }));
  propInputs[key] = inputs;
  return h('div', { class: 'xform' }, h('span', { class: 'lbl' }, label), inputs);
}

/** Show the live transform of the selected accessory in the numeric fields. */
function refreshTransformInputs() {
  const en = entry();
  const t = en && manager.readTransform(en.uid);
  if (!t || !propInputs) return;
  for (const key of ['pos', 'rot', 'scl']) {
    propInputs[key].forEach((inp, i) => { if (document.activeElement !== inp) inp.value = round(t[key][i]); });
  }
}

/** One colour picker per part (material) of the selected accessory. */
function accessoryColours(en) {
  const parts = manager.parts(en.uid);
  renderedParts = `${en.uid}:${parts.length}`;
  if (!parts.length) return null;
  const set = (key, color) => {
    const colors = { ...en.colors };
    if (color) colors[key] = color; else delete colors[key];
    en.colors = colors;
    manager.sync(look.accessories);
  };
  return h('div', { class: 'mats' }, h('span', { class: 'lbl' }, 'Colours'), parts.map((p) =>
    h('div', { class: 'mat-head' },
      h('input', { type: 'color', value: en.colors?.[p.key] ?? p.color, oninput: (e) => set(p.key, e.target.value), onchange: commit }),
      h('span', { class: 'mat-name', title: p.key }, p.key),
      h('button', { class: 'ib', title: 'Reset this colour', onclick: () => { set(p.key, null); commit(); renderRight(); } }, '↺'))));
}

let renderedParts = '';

function renderProperties() {
  propInputs = {};
  const en = entry();
  if (!en) return section('Accessory', h('p', { class: 'hint' }, 'Select an equipped accessory (in the list or by clicking it in the viewport) to fine-tune its placement.'));
  const item = catalog.get(en.item);
  const nodeInput = h('input', { type: 'text', value: en.name, onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); },
    onchange: (e) => { en.name = e.target.value.trim() || en.name; commit(); } });
  const boneSelect = h('select', { onchange: (e) => { en.bone = e.target.value; applyLook(); commit(); } },
    character.bones.map((b) => h('option', { value: b.name, selected: b.name === en.bone }, b.name)));
  const panel = section('Accessory',
    h('label', { class: 'field' }, h('span', {}, 'Name'), nodeInput),
    h('label', { class: 'field' }, h('span', {}, 'Attached to bone'), boneSelect),
    h('div', { class: 'row' }, ['translate', 'rotate', 'scale'].map((m) =>
      h('button', { 'data-mode': m, class: tc.mode === m ? 'active' : '', onclick: () => setMode(m) }, { translate: 'Move', rotate: 'Rotate', scale: 'Scale' }[m]))),
    xformRow('Position (m)', 'pos', 0.01),
    xformRow('Rotation °', 'rot', 1),
    xformRow('Scale', 'scl', 0.05),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: uniformScale, onchange: (e) => { uniformScale = e.target.checked; } }), 'Uniform scale'),
    accessoryColours(en),
    h('div', { class: 'row' },
      h('button', { onclick: () => duplicateAccessory() }, 'Duplicate'),
      h('button', { onclick: mirrorAccessory, title: 'Copy to the opposite side (left ↔ right)' }, 'Mirror'),
      h('button', { onclick: resetPlacement, disabled: !item }, 'Reset'),
      h('button', { onclick: () => removeAccessory() }, 'Remove')));
  queueMicrotask(refreshTransformInputs);
  return panel;
}

/* ----------------------------------------------------------------- export */

const fExport = h('input', { type: 'text', value: DEFAULT_EXPORT_NAME, onkeydown: (e) => e.stopPropagation() });

function exportFileName() {
  let n = fExport.value.trim().replace(/[\\/:*?"<>|]+/g, '_') || DEFAULT_EXPORT_NAME;
  if (!/\.glb$/i.test(n)) n += '.glb';
  return n;
}

async function doExport(button) {
  button.disabled = true;
  exportStatus = 'Exporting…';
  renderRight();
  try {
    const res = await exportCharacter({ character, animator, includeAnimations });
    const blob = new Blob([res.buffer], { type: 'model/gltf-binary' });
    const name = exportFileName();
    download(blob, name);
    const big = blob.size > SIZE_WARN_BYTES;
    exportStatus = `Exported ${name}: ${mb(blob.size)} MB, ${res.bones} bones, ${res.animations} animation${res.animations === 1 ? '' : 's'}, ${res.triangles.toLocaleString()} triangles${res.trianglesBefore > res.triangles ? ` (simplified)` : ''}.`
      + (big ? ` Warning: over ${mb(SIZE_WARN_BYTES)} MB.` : '');
    if (big) toast(`Exported file is ${mb(blob.size)} MB, which is large.`, 'warn', 10000);
    window.__cc.lastExport = { blob, name, ...res, buffer: undefined };
  } catch (err) {
    exportStatus = '';
    toast(`Export failed: ${err?.message || err}`, 'error', 10000);
  } finally {
    renderRight();
  }
}

function renderExport() {
  if (!character) return null;
  const st = exportStats(character);
  const clips = animator.clips.filter((c) => c.exportOn).length;
  const btn = h('button', { class: 'primary', onclick: (e) => doExport(e.target) }, 'Export GLB');
  return section('Export',
    h('label', { class: 'field' }, h('span', {}, 'Filename'), fExport),
    IS_PRODUCTION
      ? h('p', { class: 'hint' }, `All ${animator.clips.length} animations are included.`)
      : h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: includeAnimations, disabled: !animator.clips.length, onchange: (e) => { includeAnimations = e.target.checked; renderRight(); } }),
        `Include animations (${includeAnimations ? clips : 0} of ${animator.clips.length})`),
    h('p', { class: 'hint' }, `Skeleton kept: ${st.bones} bones, ${st.skinnedMeshes} skinned mesh${st.skinnedMeshes === 1 ? '' : 'es'}, ${st.triangles.toLocaleString()} triangles. Simplified to about ${EXPORT_MAX_TRIANGLES.toLocaleString()} triangles on export.`),
    btn,
    exportStatus ? h('p', { class: `hint ${/Warning/.test(exportStatus) ? 'warn' : ''}` }, exportStatus) : null);
}

function renderRight() {
  const keep = document.activeElement === fExport;
  $('#right').replaceChildren(
    character ? renderProperties() : section('Accessory', h('p', { class: 'hint' }, 'Load a character first.')),
    renderExport(),
    section('Help', h('ul', { class: 'help' },
      h('li', {}, h('kbd', {}, 'W'), ' ', h('kbd', {}, 'E'), ' ', h('kbd', {}, 'R'), ' move / rotate / scale the selected accessory; ', h('kbd', {}, 'Del'), ' removes, ', h('kbd', {}, 'Ctrl/⌘+D'), ' duplicates, ', h('kbd', {}, 'Ctrl/⌘+Z'), ' undoes, ', h('kbd', {}, 'Space'), ' plays/pauses.'),
      h('li', {}, 'Accessories are attached to bones, so they follow the animation. They are exported as children of those bones.'),
      h('li', {}, 'The export keeps the full skeleton and skinning, in the rest pose, with the ticked animations.'))));
  if (keep) fExport.focus();
}

function renderAll() { renderLeft(); renderRight(); }

/* -------------------------------------------------------------- transport */

function onAnimatorChange() {
  renderTransport();
  if (activeTab === 'anim') renderLeft();
  if (character) renderRight();
}

function renderTransport() {
  const t = $('#transport');
  const has = animator && animator.clips.length > 0;
  t.style.display = has ? '' : 'none';
  if (!has) return;
  $('#t-play').textContent = animator.playing ? '❚❚' : '▶';
  const sel = $('#t-clip');
  sel.replaceChildren(h('option', { value: '' }, '— rest pose —'),
    ...animator.clips.map((c) => h('option', { value: c.id, selected: c.id === animator.currentId }, c.clip.name || '(unnamed)')));
  sel.value = animator.currentId ?? '';
  $('#t-loop').checked = animator.loop;
  $('#t-speed').value = String(animator.speed);
}

$('#t-play').addEventListener('click', () => animator?.toggle());
$('#t-stop').addEventListener('click', () => animator?.stop());
$('#t-clip').addEventListener('change', (e) => { e.target.value ? animator.play(Number(e.target.value)) : animator.stop(); });
$('#t-loop').addEventListener('change', (e) => animator?.setLoop(e.target.checked));
$('#t-speed').addEventListener('change', (e) => animator?.setSpeed(parseFloat(e.target.value)));
const scrub = $('#t-scrub');
scrub.addEventListener('pointerdown', () => { scrubbing = true; });
scrub.addEventListener('pointerup', () => { scrubbing = false; });
scrub.addEventListener('input', () => {
  if (!animator) return;
  if (!animator.action) { const c = animator.clips[0]; if (!c) return; animator.play(c.id); }
  animator.pause();
  animator.seek(parseFloat(scrub.value) * animator.duration);
});

viewer.onFrame((dt) => {
  animator?.update(dt);
  if (animator?.action && !scrubbing) {
    const d = animator.duration || 1;
    scrub.value = Math.min(animator.time / d, 1);
  }
  if (animator) $('#t-time').textContent = `${fmtTime(animator.time)} / ${fmtTime(animator.duration)}`;
  if (tc.object) selBox.setFromObject(tc.object);
});

/* ---------------------------------------------------------------- picking */

const raycaster = new THREE.Raycaster();
let down = null;
const canvas = $('#canvas');
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, btn: e.button, gizmo: tc.axis !== null || dragging }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || down.btn !== 0 || down.gizmo || !manager) return;
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
  const r = canvas.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), viewer.camera);
  const objs = manager.objects().filter((o) => o.obj.visible).map((o) => o.obj);
  const hit = raycaster.intersectObjects(objs, true)[0];
  if (!hit) { if (selectedUid) select(null); return; }
  let o = hit.object;
  while (o && !o.userData.uid) o = o.parent;
  if (o) select(o.userData.uid);
});

/* --------------------------------------------------------------- keyboard */

window.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t instanceof HTMLElement && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'checkbox' && t.type !== 'range'))) return;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === 'z') { e.preventDefault(); e.shiftKey ? history.redo() : history.undo(); }
  else if (mod && key === 'y') { e.preventDefault(); history.redo(); }
  else if (mod && key === 'd') { e.preventDefault(); duplicateAccessory(); }
  else if (mod || e.altKey) return;
  else if (key === 'w') setMode('translate');
  else if (key === 'e') setMode('rotate');
  else if (key === 'r') setMode('scale');
  else if (key === ' ' && (t === document.body || t === canvas)) { e.preventDefault(); animator?.toggle(); }
  else if (key === 'delete' || key === 'backspace') { if (selectedUid) { e.preventDefault(); removeAccessory(); } }
  else if (key === 'escape') select(null);
});

/* ------------------------------------------------------------ file input */

/** A dropped/picked model is a character, animations, or an accessory. `all` = every file picked together (for .gltf sidecars). */
async function handleFile(file, forced, all = [file], report = null) {
  let gltf;
  try { gltf = await parseModel(file, all); } catch (err) {
    toast(`Could not load "${file.name}": ${err?.message || err?.error?.message || err}`, 'error', 12000);
    return;
  }
  if (IS_PRODUCTION && (forced === 'character' || forced === 'animation' || gltf.animations?.length)) {
    toast('This version edits the default character only. Characters and animations can not be added.', 'warn', 8000);
    return;
  }
  if (forced === 'character' || !character) { await setCharacter(gltf, file.name); return; }
  const kind = forced || (gltf.animations?.length ? 'animation' : 'accessory');
  if (gltf.isFBX && kind !== 'animation') { toast(`FBX files are only supported as animations ("${file.name}" can't be used as a character or accessory). Export it as .glb first.`, 'warn', 9000); return; }
  if (kind === 'animation') {
    if (!gltf.animations?.length) { toast(`"${file.name}" contains no animations.`, 'warn'); return; }
    const base = file.name.replace(/\.[^.]+$/, '');
    const prepared = prepareClips({ sourceRoot: gltf.scene, clips: gltf.animations, character, name: base, facing: look.facing });
    if (!prepared.length) { toast(`"${file.name}": none of its bones could be matched to this character, so the animation can't be used.`, 'error', 10000); return; }
    const added = animator.add(prepared.map((p) => p.clip), file.name);
    added.forEach((entry, i) => { if (prepared[i].method === 'retarget') { entry.retargeted = true; entry.coverage = 1; } });
    const rt = prepared.filter((p) => p.method === 'retarget');
    const r = report || newReport();
    r.clips += added.length;
    r.retargeted += rt.length;
    rt.forEach((p) => p.skipped.forEach((s) => r.lost.add(s)));
    r.bad += added.filter((a) => a.coverage < 0.5).length;
    if (!report) flushReport(r);
    activeTab = 'anim';
    renderAll();
  } else {
    equip(catalog.addCustom(gltf, file.name));
    activeTab = 'acc';
    renderLeft();
  }
}

const newReport = () => ({ clips: 0, retargeted: 0, lost: new Set(), bad: 0 });
function flushReport(r) {
  if (!r.clips) return;
  let msg = `Added ${r.clips} animation${r.clips > 1 ? 's' : ''}.`;
  if (r.retargeted) msg += ` ${r.retargeted} retargeted to this skeleton (⇄)${r.lost.size ? `; no counterpart bone for: ${[...r.lost].join(', ')}` : ''}.`;
  if (r.bad) msg += ` ${r.bad} do not match this skeleton.`;
  toast(msg, r.bad || r.lost.size ? 'warn' : 'info', 10000);
}

/** Handle a batch of files: every .glb/.gltf is a model; the rest are sidecars (.bin, textures) for .gltf files. */
async function handleFiles(files, forced) {
  const models = files.filter((f) => isModelFile(f.name));
  if (!models.length) { toast('Only .glb, .gltf and .fbx files are supported.', 'error'); return; }
  const report = newReport();
  for (const f of models) await handleFile(f, forced, files, report);
  flushReport(report);
}

const bindPicker = (id, forced) => $(id).addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  if (files.length) await handleFiles(files, forced);
});
bindPicker('#f-char', 'character');
bindPicker('#f-acc', 'accessory');
bindPicker('#f-anim', 'animation');
$('#f-look').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try { setLook(JSON.parse(await f.text())); toast('Look loaded.'); } catch { toast('That file is not a valid look.', 'error'); }
});

const viewport = $('#viewport');
let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { dragDepth++; viewport.classList.add('dragover'); } });
window.addEventListener('dragleave', (e) => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; viewport.classList.remove('dragover'); } });
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', async (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  viewport.classList.remove('dragover');
  await handleFiles([...e.dataTransfer.files]);
});

/* ---------------------------------------------------------------- toolbar */

$('#b-undo').addEventListener('click', () => history.undo());
$('#b-redo').addEventListener('click', () => history.redo());
$('#b-reset').addEventListener('click', () => {
  if (!character) return;
  selectedUid = null;
  const fresh = emptyLook();
  fresh.roles = look.roles; // rig fixes describe the model, not the look
  fresh.facing = look.facing;
  setLook(fresh);
});
$('#b-random').addEventListener('click', () => {
  if (!character) return;
  const next = randomizeLook(look, character);
  const pool = catalog.items.filter((i) => !i.custom);
  next.accessories = next.accessories.filter((a) => a.item.startsWith('custom:'));
  const cats = [...new Set(pool.map((i) => i.category))].sort(() => Math.random() - 0.5).slice(0, Math.floor(Math.random() * 3));
  for (const c of cats) {
    const item = pool.filter((i) => i.category === c)[Math.floor(Math.random() * pool.filter((i) => i.category === c).length)];
    next.accessories.push(...manager.entriesFor(item));
  }
  selectedUid = null;
  setLook(next);
});
$('#b-full').addEventListener('click', () => character && viewer.frameBox(character.currentBox()));
$('#b-face').addEventListener('click', () => {
  const head = character?.bone('head');
  if (!head) return;
  const p = head.getWorldPosition(new THREE.Vector3());
  p.y += character.height * 0.05;
  viewer.focus(p, character.height * 0.55, new THREE.Vector3(0.25, 0.05, 1));
});
$('#b-save').addEventListener('click', () => download(new Blob([JSON.stringify(persistable(), null, 2)], { type: 'application/json' }), 'my-look.json'));
$('#b-load').addEventListener('click', () => $('#f-look').click());
$('#e-choose').addEventListener('click', () => $('#f-char').click());
$('#e-placeholder').addEventListener('click', async () => {
  const gltf = await loadModelUrl(new URL(PLACEHOLDER_URL, document.baseURI).href).catch(() => null);
  if (gltf) setCharacter(gltf, 'placeholder.glb');
  else toast('Placeholder not found. Run "npm run placeholder" first.', 'error');
});

if (IS_PRODUCTION) {
  $('#dropzone').textContent = 'Drop .glb / .gltf files: accessories';
} else {
  document.title = `${APP_TITLE} (dev)`;
}
$('#notice').textContent = 'Your files never leave your browser.';

/* ------------------------------------------------------------------- init */

window.__cc = {
  THREE, viewer, tc, catalog,
  get character() { return character; }, get animator() { return animator; }, get manager() { return manager; },
  get look() { return look; }, get selectedUid() { return selectedUid; }, history: () => history,
  setCharacter, handleFile, equip, select,
};

(async function init() {
  syncHistoryButtons();
  renderAll();
  renderTransport();
  await catalog.loadManifest();
  try { look = sanitizeLook(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { look = emptyLook(); }
  // Production always uses the default character; dev prefers your own template and falls back to the default.
  let template = null;
  for (const url of IS_PRODUCTION ? [DEFAULT_CHARACTER_URL] : [...TEMPLATE_URLS, DEFAULT_CHARACTER_URL]) {
    try { template = await loadModelUrl(new URL(url, document.baseURI).href); } catch (err) { toast(`Could not load ${url}: ${err?.message || err}`, 'error', 10000); }
    if (template) { await setCharacter(template, url.split('/').pop()); break; }
  }
  if (!template && IS_PRODUCTION) toast('The default character could not be loaded.', 'error', 20000);
  else if (!template) { $('#empty').hidden = false; renderAll(); }
})();
