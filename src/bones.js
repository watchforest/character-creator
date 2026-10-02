import { BONE_ROLES } from './config.js';

/** Split a bone name into { part, side, num }: "mixamorig:LeftForeArm" -> forearm / L, "arm_right_2" -> arm / R / 2. */
export function parseBone(name) {
  const s = name.replace(/^(mixamorig|bip01|armature)[:_.\-\s]?/i, '').replace(/([a-z])([A-Z])/g, '$1 $2');
  const num = (s.match(/(\d+)\s*$/) || [])[1];
  let side = null;
  const rest = [];
  for (const t of s.toLowerCase().split(/[^a-z]+/).filter(Boolean)) {
    if (t === 'left' || t === 'l') side ??= 'L';
    else if (t === 'right' || t === 'r') side ??= 'R';
    else rest.push(t);
  }
  return { part: rest.join(''), side, num: num ? Number(num) : 0 };
}

/**
 * Resolve a role ("head", "handR", ...) or an exact bone name to a bone.
 * Returns { bone, how } where how is 'override' | 'name' | 'fallback:<role>', or null.
 * With { strict: true } nearby-bone fallbacks are not used (needed when retargeting animation).
 */
export function resolveRole(bones, role, overrides = {}, opts = {}, seen = new Set()) {
  const def = BONE_ROLES[role];
  if (!def) {
    const b = bones.find((x) => x.name === role) || null;
    return b ? { bone: b, how: 'name' } : null;
  }
  if (seen.has(role)) return null;
  seen.add(role);
  const ov = overrides[role] && bones.find((b) => b.name === overrides[role]);
  if (ov) return { bone: ov, how: 'override' };
  const parsed = bones.map((b) => ({ b, ...parseBone(b.name) }));
  for (const part of def.parts) {
    const hits = parsed.filter((p) => p.part === part && p.side === (def.side || null));
    if (!hits.length) continue;
    hits.sort((a, b) => (def.pick === 'high' ? b.num - a.num : a.num - b.num));
    return { bone: hits[0].b, how: 'name' };
  }
  if (opts.strict) return null;
  for (const f of def.fallback || []) {
    const r = resolveRole(bones, f, overrides, opts, seen);
    if (r) return { bone: r.bone, how: r.how.startsWith('fallback') ? r.how : `fallback:${f}` };
  }
  return null;
}

/** The bone on the other side of the body (left <-> right), matched by part name, or null. */
export function oppositeBone(bones, bone) {
  const p = parseBone(bone.name);
  if (!p.side) return null;
  const want = p.side === 'L' ? 'R' : 'L';
  const hits = bones.filter((b) => { const q = parseBone(b.name); return q.part === p.part && q.side === want; });
  if (!hits.length) return null;
  hits.sort((a, b) => Math.abs(parseBone(a.name).num - p.num) - Math.abs(parseBone(b.name).num - p.num));
  return hits[0];
}
