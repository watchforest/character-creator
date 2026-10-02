// Generates public/models/placeholder.glb: a simple rigged, animated, Mixamo-named
// humanoid made of boxes. Only a stand-in so the app can be developed and tested
// before a real template character is added.   Usage: npm run placeholder
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// GLTFExporter expects a browser; provide the little bit of FileReader it uses.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((r) => { this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(r).toString('base64')}`; this.onloadend?.(); }); }
};

const P = 'mixamorig';
const bones = {};
const order = [];
function bone(name, parent, x, y, z) {
  const b = new THREE.Bone();
  b.name = P + name;
  b.position.set(x, y, z);
  (parent ? bones[parent] : root).add(b);
  bones[name] = b;
  order.push(b);
  return b;
}
const root = new THREE.Group();
root.name = 'Armature';

bone('Hips', null, 0, 1.0, 0);
bone('Spine', 'Hips', 0, 0.1, 0); bone('Spine1', 'Spine', 0, 0.12, 0); bone('Spine2', 'Spine1', 0, 0.12, 0);
bone('Neck', 'Spine2', 0, 0.15, 0); bone('Head', 'Neck', 0, 0.1, 0);
for (const [side, sx] of [['Left', 1], ['Right', -1]]) {
  bone(`${side}Shoulder`, 'Spine2', sx * 0.05, 0.12, 0);
  bone(`${side}Arm`, `${side}Shoulder`, sx * 0.1, 0, 0);
  bone(`${side}ForeArm`, `${side}Arm`, sx * 0.28, 0, 0);
  bone(`${side}Hand`, `${side}ForeArm`, sx * 0.25, 0, 0);
  bone(`${side}UpLeg`, 'Hips', sx * 0.09, -0.05, 0);
  bone(`${side}Leg`, `${side}UpLeg`, 0, -0.42, 0);
  bone(`${side}Foot`, `${side}Leg`, 0, -0.42, 0);
  bone(`${side}ToeBase`, `${side}Foot`, 0, -0.08, 0.12);
}
root.updateMatrixWorld(true);
const skeleton = new THREE.Skeleton(order);

// ---- geometry: boxes rigidly bound to one bone each -------------------------
const groups = {};
function box(group, boneName, centre, size) {
  const g = new THREE.BoxGeometry(size[0], size[1], size[2]).toNonIndexed();
  g.translate(centre[0], centre[1], centre[2]);
  const n = g.attributes.position.count;
  const idx = order.indexOf(bones[boneName]);
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n).fill(0).flatMap(() => [idx, 0, 0, 0]), 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(n).fill(0).flatMap(() => [1, 0, 0, 0]), 4));
  (groups[group] ||= []).push(g);
}

box('Body_Skin', 'Head', [0, 1.69, 0], [0.17, 0.2, 0.19]);
box('Body_Skin', 'Neck', [0, 1.52, 0], [0.07, 0.08, 0.07]);
box('Hair_Short', 'Head', [0, 1.8, -0.01], [0.19, 0.06, 0.21]);
box('Hair_Short', 'Head', [0, 1.72, -0.095], [0.19, 0.16, 0.03]);
box('Hair_Long', 'Head', [0, 1.62, -0.1], [0.19, 0.3, 0.05]);
box('Body_Shirt', 'Spine1', [0, 1.3, 0], [0.34, 0.3, 0.18]);
box('Body_Shirt', 'Spine', [0, 1.12, 0], [0.3, 0.12, 0.17]);
box('Body_Pants', 'Hips', [0, 0.98, 0], [0.32, 0.16, 0.18]);
for (const [side, sx] of [['Left', 1], ['Right', -1]]) {
  box('Body_Shirt', `${side}Arm`, [sx * 0.24, 1.46, 0], [0.26, 0.085, 0.085]);
  box('Body_Shirt', `${side}ForeArm`, [sx * 0.51, 1.46, 0], [0.26, 0.07, 0.07]);
  box('Body_Skin', `${side}Hand`, [sx * 0.7, 1.46, 0], [0.1, 0.05, 0.09]);
  box('Body_Pants', `${side}UpLeg`, [sx * 0.09, 0.74, 0], [0.13, 0.42, 0.14]);
  box('Body_Pants', `${side}Leg`, [sx * 0.09, 0.32, 0], [0.11, 0.42, 0.12]);
  box('Body_Shoes', `${side}Foot`, [sx * 0.09, 0.05, 0.04], [0.11, 0.1, 0.24]);
}
const materials = {
  Body_Skin: ['Skin', 0xe0ac7e, 0.7], Body_Shirt: ['Shirt', 0x3a7bd5, 0.85], Body_Pants: ['Pants', 0x2b2f3a, 0.9],
  Body_Shoes: ['Shoes', 0x7a4a2a, 0.6], Hair_Short: ['Hair', 0x3b2a20, 0.8], Hair_Long: ['Hair', 0x3b2a20, 0.8],
};
const matCache = {};
const scene = new THREE.Group();
scene.name = 'Scene';
scene.add(root);
for (const [name, parts] of Object.entries(groups)) {
  const [mname, color, rough] = materials[name];
  const m = (matCache[mname] ||= Object.assign(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 }), { name: mname }));
  const mesh = new THREE.SkinnedMesh(mergeGeometries(parts), m);
  mesh.name = name;
  scene.add(mesh);
  mesh.bind(skeleton);
}

// ---- animations --------------------------------------------------------------
const q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x * Math.PI / 180, y * Math.PI / 180, z * Math.PI / 180));
const rest = (n) => bones[n].quaternion.clone();
function rotTrack(name, times, eulers, base = rest(name)) {
  const vals = [];
  for (const e of eulers) base.clone().multiply(q(...e)).toArray(vals, vals.length);
  return new THREE.QuaternionKeyframeTrack(`${P}${name}.quaternion`, times, vals);
}
const idleArms = (sway) => [
  rotTrack('LeftArm', [0, 1, 2], [[0, 0, -68 + sway], [0, 0, -68 - sway], [0, 0, -68 + sway]]),
  rotTrack('RightArm', [0, 1, 2], [[0, 0, 68 - sway], [0, 0, 68 + sway], [0, 0, 68 - sway]]),
  rotTrack('LeftForeArm', [0, 2], [[0, 0, -8], [0, 0, -8]]),
  rotTrack('RightForeArm', [0, 2], [[0, 0, 8], [0, 0, 8]]),
];
const idle = new THREE.AnimationClip('Idle', 2, [
  ...idleArms(3),
  rotTrack('Spine1', [0, 1, 2], [[0, 0, 0], [2.5, 0, 0], [0, 0, 0]]),
  rotTrack('Head', [0, 1, 2], [[0, 0, 0], [-2, 3, 0], [0, 0, 0]]),
]);
const swing = (side, ph) => [
  rotTrack(`${side}UpLeg`, [0, 0.5, 1], [[ph * 28, 0, 0], [-ph * 28, 0, 0], [ph * 28, 0, 0]]),
  rotTrack(`${side}Leg`, [0, 0.25, 0.5, 0.75, 1], ph > 0 ? [[0, 0, 0], [0, 0, 0], [0, 0, 0], [-35, 0, 0], [0, 0, 0]] : [[-35, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [-35, 0, 0]]),
];
const walk = new THREE.AnimationClip('Walk', 1, [
  ...swing('Left', 1), ...swing('Right', -1), ...idleArms(0).slice(0, 2),
  rotTrack('LeftArm', [0, 0.5, 1], [[0, 0, -68], [-25, 0, -68], [0, 0, -68]]),
  new THREE.VectorKeyframeTrack(`${P}Hips.position`, [0, 0.25, 0.5, 0.75, 1], [0, 1.0, 0, 0, 0.97, 0.15, 0, 1.0, 0.3, 0, 0.97, 0.45, 0, 1.0, 0.6]),
  rotTrack('Spine1', [0, 0.5, 1], [[0, 4, 0], [0, -4, 0], [0, 4, 0]]),
]);
// idleArms() and the arm swing both set LeftArm; keep the last track per name.
walk.tracks = [...new Map(walk.tracks.map((t) => [t.name, t])).values()];
const wave = new THREE.AnimationClip('Wave', 2, [
  rotTrack('LeftArm', [0, 2], [[0, 0, -68], [0, 0, -68]]),
  rotTrack('RightArm', [0, 0.4, 1.6, 2], [[0, 0, 68], [0, 0, 150], [0, 0, 150], [0, 0, 68]]),
  rotTrack('RightForeArm', [0, 0.4, 0.8, 1.2, 1.6, 2], [[0, 0, 8], [0, 0, 35], [0, 0, -5], [0, 0, 35], [0, 0, -5], [0, 0, 8]]),
  rotTrack('Head', [0, 1, 2], [[0, 0, 0], [0, -8, 4], [0, 0, 0]]),
]);

// ---- export ------------------------------------------------------------------
const exporter = new GLTFExporter();
const glb = await new Promise((res, rej) => exporter.parse(scene, res, rej, { binary: true, animations: [idle, walk, wave] }));
fs.mkdirSync('public/models', { recursive: true });
fs.writeFileSync('public/models/placeholder.glb', Buffer.from(glb));
console.log(`public/models/placeholder.glb  ${glb.byteLength} bytes, ${order.length} bones`);
