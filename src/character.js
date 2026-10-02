import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { BODY_SLIDERS, REF_HEIGHT } from './config.js';
import { resolveRole } from './bones.js';
import { stripNonGeometry } from './util.js';

const makeLoader = (manager) => new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
const basename = (u) => { try { return decodeURIComponent(u.split(/[?#]/)[0].split('/').pop()); } catch { return u; } };

export function parseGLB(buffer) {
  return new Promise((resolve, reject) => makeLoader().parse(buffer, '', resolve, reject));
}

/** True when the buffer starts with the binary glTF magic ("glTF"). */
export const isGLB = (buffer) => buffer.byteLength > 12 && new DataView(buffer).getUint32(0, true) === 0x46546c67;

export const isModelFile = (name) => /\.(glb|gltf|fbx)$/i.test(name);

/**
 * Parse a picked/dropped .glb or .gltf. A .gltf may reference external .bin and
 * texture files: pass the files that were picked/dropped with it as `siblings`
 * and they are resolved by file name.
 */
export async function parseModel(file, siblings = []) {
  if (/\.fbx$/i.test(file.name)) {
    // Loaded on demand: FBX is only used as an animation source.
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
    const group = new FBXLoader().parse(await file.arrayBuffer(), '');
    return { scene: group, animations: group.animations || [], isFBX: true };
  }
  if (!/\.gltf$/i.test(file.name)) return parseGLB(await file.arrayBuffer());
  const text = await file.text();
  const urls = new Map(siblings.filter((f) => f !== file).map((f) => [f.name, URL.createObjectURL(f)]));
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => urls.get(basename(url)) ?? url);
  try {
    return await new Promise((resolve, reject) => makeLoader(manager).parse(text, '', resolve, reject));
  } catch (err) {
    const msg = err?.message || err?.error?.message || String(err);
    throw new Error(siblings.length > 1 ? msg : `${msg}. If this .gltf uses external .bin or texture files, select or drop them together with it.`);
  } finally {
    urls.forEach((u) => URL.revokeObjectURL(u));
  }
}

/** Load a .glb or .gltf from a URL, or null if it is missing (dev servers answer 200 + index.html). */
export async function loadModelUrl(url) {
  let res;
  try { res = await fetch(url); } catch { return null; }
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  if (isGLB(buf)) return parseGLB(buf);
  const text = new TextDecoder().decode(buf);
  if (!text.trimStart().startsWith('{') || !text.includes('"asset"')) return null;
  const base = new URL('.', new URL(url, document.baseURI)).href; // external files resolve next to the .gltf
  return new Promise((resolve, reject) => makeLoader().parse(text, base, resolve, reject));
}

/**
 * The template character: the loaded scene plus everything the editor needs to
 * know about it (bones, materials, parts) and the rest pose to export from.
 */
export class Character {
  constructor(gltf, name) {
    this.name = name;
    this.scene = gltf.scene;
    this.animations = gltf.animations || [];
    stripNonGeometry(this.scene);
    this.scene.updateMatrixWorld(true);

    this.bones = [];
    this.meshes = [];       // { key, mesh }
    this.materialList = []; // { key, material, orig, parts }
    const boneSet = new Set();
    const matByUuid = new Map();
    const usedMeshKeys = new Set();
    const usedMatKeys = new Set();
    const uniqueKey = (base, used) => {
      let k = base, i = 2;
      while (used.has(k)) k = `${base}#${i++}`;
      used.add(k);
      return k;
    };

    // A flat (untextured) material shared by several meshes is cloned per mesh so each
    // part can get its own colour. Textured materials stay shared (one texture atlas).
    const users = new Map();
    this.scene.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) users.set(m, (users.get(m) || 0) + 1);
    });
    this.scene.traverse((o) => {
      if (!o.isMesh) return;
      const split = (m) => (users.get(m) > 1 && !m.map ? Object.assign(m.clone(), { name: `${m.name || 'material'} · ${o.name || 'mesh'}` }) : m);
      o.material = Array.isArray(o.material) ? o.material.map(split) : split(o.material);
    });

    this.scene.traverse((o) => {
      if (o.isBone && !boneSet.has(o)) { boneSet.add(o); this.bones.push(o); }
      if (!o.isMesh) return;
      o.castShadow = true;
      if (o.isSkinnedMesh) {
        o.frustumCulled = false;
        o.skeleton.bones.forEach((b) => { if (!boneSet.has(b)) { boneSet.add(b); this.bones.push(b); } });
      }
      const key = uniqueKey(o.name || `mesh_${this.meshes.length + 1}`, usedMeshKeys);
      this.meshes.push({ key, mesh: o });
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
        let entry = matByUuid.get(material.uuid);
        if (!entry) {
          entry = {
            key: uniqueKey(material.name || `material_${this.materialList.length + 1}`, usedMatKeys),
            material,
            orig: {
              color: material.color ? `#${material.color.getHexString()}` : null,
              roughness: material.roughness,
              metalness: material.metalness,
            },
            parts: [],
          };
          matByUuid.set(material.uuid, entry);
          this.materialList.push(entry);
        }
        entry.parts.push(key);
      }
    });

    // Rest pose = pose as loaded. Used to reset after animation and before export.
    this.rest = new Map(this.bones.map((b) => [b, { p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }]));
    this.restRootScale = this.scene.scale.clone();

    // World scale of each bone at rest. Accessory anchors compensate for it so
    // accessories keep real-world size even if the rig has a 0.01 armature scale.
    this.baseScale = new Map();
    this.restWorld = new Map(); // bone -> world matrix at rest
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (const b of this.bones) {
      b.matrixWorld.decompose(p, q, s);
      this.baseScale.set(b, s.x || 1);
      this.restWorld.set(b, b.matrixWorld.clone());
    }
    this.roleOverrides = {};
    this.influenceBoxes = this.computeInfluence();

    const box = new THREE.Box3().setFromObject(this.scene, true);
    this.box = box;
    this.height = Math.max(box.max.y - box.min.y, 0.01);
    this.unit = this.height / REF_HEIGHT; // accessory size factor
  }

  /** Resolve a role ("head", "handR", ...) or exact bone name; see BONE_ROLES. */
  resolve(roleOrName) { return resolveRole(this.bones, roleOrName, this.roleOverrides); }
  bone(roleOrName) { return this.resolve(roleOrName)?.bone || null; }
  /** Like bone(), but only a real match (no nearby-bone fallback). */
  boneStrict(role) { return resolveRole(this.bones, role, this.roleOverrides, { strict: true })?.bone || null; }

  /**
   * World-space box (at rest) of the vertices a bone drives most, or of the nearest
   * ancestor bone that drives any. Used to place and size accessories on odd rigs.
   */
  influence(bone) {
    for (let b = bone; b && b.isBone; b = b.parent) {
      const box = this.influenceBoxes.get(b);
      if (box && !box.isEmpty()) return box;
    }
    return null;
  }

  computeInfluence() {
    const boxes = new Map();
    const v = new THREE.Vector3();
    for (const { mesh } of this.meshes) {
      if (!mesh.isSkinnedMesh) continue;
      const { skinIndex, skinWeight } = mesh.geometry.attributes;
      if (!skinIndex || !skinWeight) continue;
      mesh.skeleton.update();
      const bones = mesh.skeleton.bones;
      const step = Math.max(1, Math.ceil(skinIndex.count / 200000)); // sample huge meshes
      for (let i = 0; i < skinIndex.count; i += step) {
        let best = 0, bw = 0;
        for (let k = 0; k < 4; k++) {
          const w = skinWeight.getComponent(i, k);
          if (w > bw) { bw = w; best = skinIndex.getComponent(i, k); }
        }
        const bone = bones[best];
        if (!bone || bw <= 0) continue;
        mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
        let box = boxes.get(bone);
        if (!box) boxes.set(bone, (box = new THREE.Box3()));
        box.expandByPoint(v);
      }
    }
    return boxes;
  }
  boneByName(name) { return this.bones.find((b) => b.name === name) || null; }

  /** Sliders for which this rig actually has bones. */
  availableSliders() {
    return BODY_SLIDERS.filter((s) => s.roles.some((r) => this.bone(r)));
  }

  /** Roles that were not found by name (resolved through a fallback, or not at all). */
  roleReport(roles) {
    return roles.map(([label, role]) => ({ label, role, ...(this.resolve(role) || { bone: null, how: 'none' }) }));
  }

  /** Apply the parts of a look that live on the character itself. */
  applyLook(look) {
    this.roleOverrides = look.roles || {};
    for (const m of this.materialList) {
      const v = look.materials[m.key] || {};
      if (m.material.color) m.material.color.set(v.color ?? m.orig.color);
      if (m.orig.roughness !== undefined) m.material.roughness = v.roughness ?? m.orig.roughness;
      if (m.orig.metalness !== undefined) m.material.metalness = v.metalness ?? m.orig.metalness;
    }
    const hidden = new Set(look.hiddenParts);
    for (const { key, mesh } of this.meshes) mesh.visible = !hidden.has(key);

    this.scene.scale.copy(this.restRootScale).multiplyScalar(look.body.height || 1);
    for (const b of this.bones) this.rest.get(b) && b.scale.copy(this.rest.get(b).s);
    for (const s of this.availableSliders()) {
      const f = look.body.sliders[s.id] ?? 1;
      for (const r of s.roles) {
        const b = this.bone(r);
        if (b) b.scale.copy(this.rest.get(b).s).multiplyScalar(f);
      }
    }
  }

  /** Back to the loaded pose (position/rotation only; proportions stay). */
  resetPose() {
    for (const b of this.bones) {
      const r = this.rest.get(b);
      b.position.copy(r.p);
      b.quaternion.copy(r.q);
    }
  }

  /** World-space bounding box of the visible character (skinned meshes included). */
  currentBox() {
    this.scene.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(this.scene, true);
  }
}
