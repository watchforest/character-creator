import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer';
import { EXPORT_MAX_TRIANGLES, SIMPLIFY_ERRORS } from './config.js';

const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

/** Visible skinned meshes (the character's body); accessories are small props and are never decimated. */
function collect(root) {
  const skinned = [], other = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    (o.isSkinnedMesh ? skinned : other).push(o);
  });
  return { skinned, other };
}

/** Index ranges to simplify separately (one per material group, or the whole mesh). */
function ranges(geo) {
  const total = geo.index ? geo.index.count : geo.attributes.position.count;
  if (!geo.groups.length) return [{ start: 0, count: total, materialIndex: 0 }];
  return geo.groups.map((g) => ({ start: g.start, count: Math.min(g.count, total - g.start), materialIndex: g.materialIndex }));
}

/** A copy of `geo` with fewer triangles. Skin indices/weights, UVs, etc. are carried over per vertex. */
function simplifyGeometry(geo, ratio, error) {
  const pos = geo.attributes.position;
  const positions = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { positions[i * 3] = pos.getX(i); positions[i * 3 + 1] = pos.getY(i); positions[i * 3 + 2] = pos.getZ(i); }
  const src = geo.index ? geo.index.array : null;

  const parts = [];
  for (const r of ranges(geo)) {
    const idx = new Uint32Array(r.count);
    for (let i = 0; i < r.count; i++) idx[i] = src ? src[r.start + i] : r.start + i;
    const target = Math.max(3, Math.floor((idx.length * ratio) / 3) * 3);
    const [out] = MeshoptSimplifier.simplify(idx, positions, 3, target, error);
    parts.push({ out, materialIndex: r.materialIndex });
  }

  // Keep only the vertices still referenced, in first-use order.
  const all = new Uint32Array(parts.reduce((n, p) => n + p.out.length, 0));
  let o = 0;
  for (const p of parts) { all.set(p.out, o); o += p.out.length; }
  const before = new Uint32Array(all); // old indices, to find each kept vertex's source
  const [remap, vertexCount] = MeshoptSimplifier.compactMesh(all); // rewrites `all` to new indices; remap[old] = new
  const kept = new Uint32Array(vertexCount); // kept[new] = old
  for (const old of before) kept[remap[old]] = old;

  const next = new THREE.BufferGeometry();
  const copy = (a) => {
    const arr = new a.array.constructor(vertexCount * a.itemSize);
    for (let i = 0; i < vertexCount; i++) for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = a.array[kept[i] * a.itemSize + k];
    return new THREE.BufferAttribute(arr, a.itemSize, a.normalized);
  };
  for (const [name, a] of Object.entries(geo.attributes)) {
    if (a.isInterleavedBufferAttribute) {
      const flat = new THREE.BufferAttribute(new a.array.constructor(a.count * a.itemSize), a.itemSize, a.normalized);
      for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) flat.array[i * a.itemSize + k] = a.getComponent(i, k);
      next.setAttribute(name, copy(flat));
    } else next.setAttribute(name, copy(a));
  }
  for (const [name, list] of Object.entries(geo.morphAttributes)) next.morphAttributes[name] = list.map(copy);
  next.morphTargetsRelative = geo.morphTargetsRelative;
  next.setIndex(new THREE.BufferAttribute(all, 1));

  if (geo.groups.length) {
    let start = 0;
    parts.forEach((p) => { next.addGroup(start, p.out.length, p.materialIndex); start += p.out.length; });
  }
  return next;
}

/**
 * Reduce the character's skinned meshes to about EXPORT_MAX_TRIANGLES in total, proportionally,
 * by temporarily swapping their geometry. Skinning is untouched (same skeleton, bind matrices
 * and per-vertex joints/weights), so animations keep working. Call `restore()` when done.
 */
export async function simplifyForExport(root) {
  const { skinned, other } = collect(root);
  const before = skinned.reduce((n, m) => n + triCount(m.geometry), 0);
  const noop = { before, after: before, restore() {} };
  const budget = Math.max(EXPORT_MAX_TRIANGLES - other.reduce((n, m) => n + triCount(m.geometry), 0), 1000);
  if (before <= budget) return noop;

  await MeshoptSimplifier.ready;
  if (!MeshoptSimplifier.supported) return noop;

  // Loosen the error limit step by step until the budget is met (the first step is the strictest).
  let result = null;
  for (const error of SIMPLIFY_ERRORS) {
    result?.forEach((r) => r.geometry.dispose());
    result = skinned.map((mesh) => ({ mesh, geometry: simplifyGeometry(mesh.geometry, budget / before, error) }));
    if (result.reduce((n, r) => n + triCount(r.geometry), 0) <= budget) break;
  }

  const originals = result.map((r) => r.mesh.geometry);
  result.forEach((r) => { r.mesh.geometry = r.geometry; });
  return {
    before,
    after: result.reduce((n, r) => n + triCount(r.geometry), 0),
    restore() {
      result.forEach((r, i) => { r.mesh.geometry = originals[i]; r.geometry.dispose(); });
    },
  };
}
