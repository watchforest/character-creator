import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MANIFEST_URL } from './config.js';
import { BUILTIN_ITEMS } from './builtins.js';
import { loadModelUrl } from './character.js';
import { oppositeBone, parseBone } from './bones.js';
import { stripNonGeometry, RAD, DEG } from './util.js';
import { uid } from './look.js';

const parseBoneSide = (bone) => parseBone(bone.name).side;

const mirrorEntry = (e) => ({
  ...e,
  uid: uid(),
  pos: [-e.pos[0], e.pos[1], e.pos[2]],
  rot: [e.rot[0], -e.rot[1], -e.rot[2]],
  scl: [-e.scl[0], e.scl[1], e.scl[2]],
  colors: { ...e.colors },
});

/** All items that can be equipped: built-ins, manifest entries and session-only custom GLBs. */
export class Catalog {
  constructor() {
    this.items = [...BUILTIN_ITEMS];
    this.models = new Map(); // id -> Promise<Object3D> (templates, cloned per instance)
    this.customCount = 0;
  }

  async loadManifest() {
    try {
      const res = await fetch(new URL(MANIFEST_URL, document.baseURI));
      if (!res.ok) return;
      const json = await res.json();
      for (const raw of json.items || []) {
        if (!raw.id || !raw.file) continue;
        this.items.push({
          category: 'Other', bone: 'head', anchor: 'origin', fit: null, position: [0, 0, 0], rotation: [0, 0, 0], scale: 1,
          ...raw,
          id: `item:${raw.id}`,
          url: new URL(raw.file, new URL(MANIFEST_URL, document.baseURI)).href,
        });
      }
    } catch { /* no manifest: built-ins only */ }
  }

  get(id) { return this.items.find((i) => i.id === id) || null; }
  get categories() { return [...new Set(this.items.map((i) => i.category))]; }

  /** Register a user-supplied model for this session, centred and auto-sized to ~30 cm. */
  addCustom(gltf, filename) {
    const model = gltf.scene;
    stripNonGeometry(model);
    const box = new THREE.Box3().setFromObject(model, true);
    const centre = box.getCenter(new THREE.Vector3());
    const size = Math.max(...box.getSize(new THREE.Vector3()).toArray(), 1e-6);
    model.position.sub(centre);
    const wrap = new THREE.Group();
    wrap.add(model);
    const item = {
      id: `custom:${++this.customCount}:${filename}`,
      name: filename.replace(/\.(glb|gltf)$/i, ''),
      category: 'Custom', bone: 'head', anchor: 'top', position: [0, 0.1, 0], rotation: [0, 0, 0],
      scale: 0.3 / size, custom: true,
    };
    this.items.push(item);
    this.models.set(item.id, Promise.resolve(wrap));
    return item;
  }

  /** A fresh, independent instance of an item's model. */
  async instantiate(item) {
    if (item.build) return item.build();
    if (!this.models.has(item.id)) {
      this.models.set(item.id, loadModelUrl(item.url)
        .then((g) => { if (!g) throw new Error(`could not load ${item.url}`); stripNonGeometry(g.scene); return g.scene; }));
    }
    const template = await this.models.get(item.id);
    return cloneSkinned(template);
  }
}

/**
 * Attaches accessories to the character's bones and keeps them in sync with the look.
 *
 * Each accessory sits in an "anchor" node that is a child of its bone. The anchor
 * cancels the bone's rest rotation and scale, so the accessory's own position / rotation
 * / scale are in plain *character space* (up = +Y, front = +Z, 1 unit = 1 m for a 1.8 m
 * character), whatever the rig's bone axes look like. The anchor point can be the bone
 * origin or a point on the body part the bone moves (top of the head, front of the face,
 * outer end of an arm, ...), and size can be fitted to that body part.
 */
export class AccessoryManager {
  constructor(character, catalog) {
    this.character = character;
    this.catalog = catalog;
    this.instances = new Map(); // uid -> { anchor, obj, mats }
    this.token = 0;
    this.facing = 'z+';
  }

  /** Default look entries for equipping an item (two for left/right pairs). */
  entriesFor(item) {
    const ch = this.character;
    const boneFor = (key) => ch.bone(key) || ch.bone('chest') || ch.bone('hips') || ch.bones[0];
    const s = Array.isArray(item.scale) ? item.scale : [item.scale, item.scale, item.scale];
    const bone = boneFor(item.bone);
    const entry = {
      uid: uid(), item: item.id, name: item.name, bone: bone ? bone.name : '',
      anchor: item.anchor || 'origin', fit: item.fit || null,
      pos: [...item.position], rot: [...item.rotation], scl: [...s], visible: true, colors: {},
    };
    if (!bone) return [entry];
    const out = [entry];
    if (item.pair) {
      const second = ch.bone(item.pair[1]) || oppositeBone(ch.bones, bone);
      if (second) out.push({ ...mirrorEntry(entry), bone: second.name });
    }
    return out;
  }

  /** Mirrored copy on the opposite-side bone, or null if the bone has no counterpart. */
  mirrorOf(entry) {
    const bone = this.character.boneByName(entry.bone);
    const opp = bone && oppositeBone(this.character.bones, bone);
    return opp ? { ...mirrorEntry(entry), bone: opp.name } : null;
  }

  objects() { return [...this.instances.entries()].map(([uid, i]) => ({ uid, obj: i.obj })); }
  object(uid) { return this.instances.get(uid)?.obj || null; }

  remove(uid) {
    const inst = this.instances.get(uid);
    if (!inst) return;
    inst.anchor.parent?.remove(inst.anchor);
    this.instances.delete(uid);
  }

  async sync(entries) {
    const token = ++this.token;
    const want = new Set(entries.map((e) => e.uid));
    for (const id of [...this.instances.keys()]) if (!want.has(id)) this.remove(id);
    for (const e of entries) {
      let inst = this.instances.get(e.uid);
      if (!inst) {
        const item = this.catalog.get(e.item);
        if (!item) continue;
        let obj;
        try { obj = await this.catalog.instantiate(item); } catch (err) { console.warn('accessory failed', e.item, err); continue; }
        if (token !== this.token) return; // a newer sync superseded this one
        obj.userData.uid = e.uid;
        obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        const anchor = new THREE.Group();
        anchor.add(obj);
        inst = { anchor, obj, parts: this.buildParts(obj) };
        this.instances.set(e.uid, inst);
      }
      this.update(inst, e);
    }
  }

  /** Where on the bone's body part the anchor sits, in world space at rest, plus the part's size. */
  anchorPoint(bone, anchor) {
    const ch = this.character;
    const origin = new THREE.Vector3().setFromMatrixPosition(ch.restWorld.get(bone));
    const box = ch.influence(bone);
    if (!box) return { point: origin, size: null };
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const front = this.facing === 'z-' ? -1 : 1;
    const sideSign = { L: 1, R: -1 }[parseBoneSide(bone)] ?? 0; // character's left is +X when facing +Z
    const p = c.clone();
    switch (anchor) {
      case 'top': p.y = box.max.y; break;
      case 'bottom': p.y = box.min.y; break;
      case 'front': p.z = front > 0 ? box.max.z : box.min.z; break;
      case 'back': p.z = front > 0 ? box.min.z : box.max.z; break;
      case 'outer': if (sideSign) p.x = sideSign * front > 0 ? box.max.x : box.min.x; break;
      case 'center': break;
      default: return { point: origin, size };
    }
    return { point: p, size };
  }

  update(inst, e) {
    const ch = this.character;
    const bone = ch.boneByName(e.bone) || ch.bone('hips') || ch.bones[0];
    if (!bone) return;
    if (inst.anchor.parent !== bone) bone.add(inst.anchor);

    const { point, size } = this.anchorPoint(bone, e.anchor || 'origin');
    // Size: fit to the body part when asked (hat -> head width), else scale with character height.
    let world = ch.unit;
    if (e.fit && size) {
      const v = e.fit.axis === 'xz' ? (size.x + size.z) / 2 : size[e.fit.axis];
      if (v > 1e-6 && e.fit.ref > 0) world = v / e.fit.ref;
    }
    const facingQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.facing === 'z-' ? Math.PI : 0);
    const restInv = ch.restWorld.get(bone).clone().invert();
    inst.anchor.position.copy(point).applyMatrix4(restInv);
    inst.anchor.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(restInv)).multiply(facingQ);
    inst.anchor.scale.setScalar(world / (ch.baseScale.get(bone) || 1));
    inst.anchor.name = `${e.name} mount`;

    inst.obj.position.fromArray(e.pos);
    inst.obj.rotation.set(e.rot[0] * RAD, e.rot[1] * RAD, e.rot[2] * RAD);
    inst.obj.scale.fromArray(e.scl);
    inst.obj.name = e.name;
    inst.obj.visible = e.visible !== false;
    for (const p of inst.parts) {
      const c = e.colors?.[p.key];
      for (const m of p.mats) { if (c) m.color.set(c); else m.color.copy(p.orig); }
    }
  }

  /**
   * Clone the instance's materials (so recolouring one never affects another) and group them
   * into recolourable parts, one per original material. A part's key is the material name.
   */
  buildParts(obj) {
    const parts = [], byMaterial = new Map(), usedKeys = new Set();
    const own = (m) => {
      if (!m.color) return m;
      let part = byMaterial.get(m);
      if (!part) {
        const base = m.name || `Part ${parts.length + 1}`;
        let key = base, i = 2;
        while (usedKeys.has(key)) key = `${base} ${i++}`;
        usedKeys.add(key);
        part = { key, orig: m.color.clone(), mats: [] };
        byMaterial.set(m, part);
        parts.push(part);
      }
      const copy = m.clone();
      part.mats.push(copy);
      return copy;
    };
    obj.traverse((o) => {
      if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material);
    });
    return parts;
  }

  /** The recolourable parts of an instance: [{ key, color (original, #rrggbb) }]. Empty until it has loaded. */
  parts(uid) {
    return (this.instances.get(uid)?.parts || []).map((p) => ({ key: p.key, color: `#${p.orig.getHexString()}` }));
  }

  /** Read the live transform of an instance back into look-entry fields. */
  readTransform(uid) {
    const o = this.object(uid);
    if (!o) return null;
    return {
      pos: o.position.toArray(),
      rot: [o.rotation.x * DEG, o.rotation.y * DEG, o.rotation.z * DEG],
      scl: o.scale.toArray(),
    };
  }
}
