import * as THREE from 'three';
import { RETARGET_ROLES } from './config.js';
import { resolveRole } from './bones.js';

const IDENT = new THREE.Quaternion();
const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

/** Fraction of a clip's tracks whose target node exists under `root`. */
export function trackCoverage(clip, root) {
  if (!clip.tracks.length) return 0;
  let hit = 0;
  for (const t of clip.tracks) {
    const { nodeName } = THREE.PropertyBinding.parseTrackName(t.name);
    if (!nodeName || root.getObjectByName(nodeName)) hit++;
  }
  return hit / clip.tracks.length;
}

/** World rotation and (uniform) scale of a node or world matrix; identity for null. */
function worldRS(m) {
  const q = new THREE.Quaternion(), s = new THREE.Vector3();
  if (!m) return { q, s: 1 };
  (m.matrixWorld || m).decompose(new THREE.Vector3(), q, s);
  return { q, s: s.x || 1 };
}
const spanY = (bones, matrixOf) => {
  let lo = Infinity, hi = -Infinity;
  for (const b of bones) {
    const y = new THREE.Vector3().setFromMatrixPosition(matrixOf(b)).y;
    lo = Math.min(lo, y); hi = Math.max(hi, y);
  }
  return Math.max(hi - lo, 1e-6);
};

/** Value of keyframes (times, values) at any time, clamped at the ends. Returns a function (t, out) => out. */
function sampler(times, values, size) {
  if (times.length < 2) return (t, out) => { for (let i = 0; i < size; i++) out[i] = values[i]; return out; };
  const Interp = size === 4 ? THREE.QuaternionLinearInterpolant : THREE.LinearInterpolant;
  const it = new Interp(times, values, size, new Float32Array(size));
  return (t, out) => { const r = it.evaluate(t); for (let i = 0; i < size; i++) out[i] = r[i]; return out; };
}
const mergeTimes = (lists) => [...new Set(lists.flatMap((l) => Array.from(l)))].sort((a, b) => a - b);

/**
 * Turn animation clips from any skeleton into clips for `character`.
 *  - Same bone names (e.g. Mixamo -> Mixamo): used as is; position tracks are scaled when the units differ (FBX is in cm).
 *  - Different skeleton: retargeted by role (strict matching on both sides, no fallback bones). Each bone's
 *    rotation change is taken relative to its rest pose and converted between the two rigs' rest orientations
 *    (plus a half turn when the character faces -Z). Root motion (the hips' position and whole-body rotation, which
 *    may sit on an armature node above the hips) is scaled to the new body size and put on the hips bone, or on
 *    the root bone when the character has no hips. Bones without a counterpart are skipped and reported.
 * Returns [{ clip, method: 'direct' | 'retarget', mapped, skipped }] (clips that could not be used are omitted).
 */
export function prepareClips({ sourceRoot, clips, character, name, facing = 'z+' }) {
  sourceRoot.updateMatrixWorld(true);
  const srcBones = [];
  sourceRoot.traverse((o) => { if (o.isBone) srcBones.push(o); }); // true bones only, not the armature Group
  const tgtMatrix = (b) => character.restWorld.get(b) || b.matrixWorld;
  const k = srcBones.length > 1 && character.bones.length > 1
    ? spanY(character.bones, tgtMatrix) / spanY(srcBones, (b) => b.matrixWorld)
    : 1;
  const F = facing === 'z-' ? FLIP : IDENT;
  const results = [];
  for (const clip of clips) {
    const label = clips.length === 1 && name ? name : clip.name || name || 'animation';
    if (trackCoverage(clip, character.scene) >= 0.8) {
      const copy = clip.clone();
      copy.name = label;
      if (Math.abs(k - 1) > 0.05) for (const t of copy.tracks) if (t.name.endsWith('.position')) t.values = t.values.map((v) => v * k);
      results.push({ clip: copy, method: 'direct', mapped: [], skipped: [] });
      continue;
    }
    const r = retarget(clip, label, srcBones, character, k, F);
    if (r) results.push(r);
  }
  return results;
}

function retarget(clip, label, srcBones, character, k, F) {
  const trackOf = (node, prop) => clip.tracks.find((t) => t.name === `${node.name}.${prop}`);
  const rotOf = (b) => worldRS(character.restWorld.get(b) || b).q;
  const Fi = F.clone().invert();
  const mapped = [], skipped = [];
  const rotations = new Map(); // target bone -> [{ times, deltas }] (rotation changes in the bone's local frame)
  const positions = [];
  const used = new Set();
  const addRot = (tb, times, deltas) => { if (!rotations.has(tb)) rotations.set(tb, []); rotations.get(tb).push({ times, deltas }); };

  // Root motion. The hips often have no position track; it sits on an ancestor (an armature node).
  const sh = resolveRole(srcBones, 'hips', {}, { strict: true })?.bone;
  if (sh) {
    let posNode = null, rotNode = null;
    for (let n = sh; n && !posNode; n = n.parent) if (trackOf(n, 'position')) posNode = n;
    for (let n = sh.parent; n && !rotNode; n = n.parent) if (trackOf(n, 'quaternion')) rotNode = n;
    const hipsQ = trackOf(sh, 'quaternion');
    const posT = posNode && trackOf(posNode, 'position');
    const rotT = rotNode && trackOf(rotNode, 'quaternion');
    if (hipsQ || posT || rotT) {
      const strictHips = character.boneStrict('hips');
      const tb = strictHips || character.bones.find((b) => !(b.parent && b.parent.isBone));
      if (!tb) skipped.push('hips');
      else {
        used.add(tb);
        mapped.push(strictHips ? 'hips' : 'root (from hips)');
        const times = mergeTimes([hipsQ, posT, rotT].filter(Boolean).map((t) => t.times));
        const sampleH = hipsQ && sampler(hipsQ.times, hipsQ.values, 4);
        const sampleR = rotT && sampler(rotT.times, rotT.values, 4);
        const sampleP = posT && sampler(posT.times, posT.values, 3);

        const qh0 = sh.quaternion, qh0i = qh0.clone().invert();
        const qr0 = rotNode ? rotNode.quaternion : IDENT;
        const Pw = rotNode?.parent ? worldRS(rotNode.parent).q : IDENT.clone();
        // M: fixed rotation between the rotation node and the hips' parent.
        const M = qr0.clone().invert().multiply(Pw.clone().invert()).multiply(worldRS(sh.parent).q);
        const Mi = M.clone().invert(), qr0i = qr0.clone().invert(), Pwi = Pw.clone().invert();
        const Rt0 = rotOf(tb), Rt0i = Rt0.clone().invert();

        const posParent = posNode?.parent ? worldRS(posNode.parent) : { q: IDENT, s: 1 };
        const tp = worldRS(tb.parent ? character.restWorld.get(tb.parent) || tb.parent : null);
        const tpInv = tp.q.clone().invert();
        const tRestPos = character.rest.get(tb).p;

        const qh = new THREE.Quaternion(), qr = new THREE.Quaternion(), dw = new THREE.Quaternion();
        const a = [0, 0, 0, 0], pv = [0, 0, 0], v = new THREE.Vector3();
        const deltas = new Float32Array(times.length * 4);
        const pout = new Float32Array(times.length * 3);
        times.forEach((t, i) => {
          qh.fromArray(sampleH ? sampleH(t, a) : qh0.toArray(a));
          qr.fromArray(sampleR ? sampleR(t, a) : qr0.toArray(a));
          // The hips' world rotation change since rest: Pw qr M qh qh0^-1 M^-1 qr0^-1 Pw^-1.
          dw.copy(Pw).multiply(qr).multiply(M).multiply(qh).multiply(qh0i).multiply(Mi).multiply(qr0i).multiply(Pwi);
          dw.premultiply(F).multiply(Fi);                         // into the character's facing
          dw.premultiply(Rt0i).multiply(Rt0).toArray(deltas, i * 4); // and the root bone's local frame
          if (sampleP) {
            sampleP(t, pv);
            v.set(pv[0] - posNode.position.x, pv[1] - posNode.position.y, pv[2] - posNode.position.z)
              .multiplyScalar(posParent.s).applyQuaternion(posParent.q).multiplyScalar(k)
              .applyQuaternion(F).applyQuaternion(tpInv).multiplyScalar(1 / tp.s).add(tRestPos)
              .toArray(pout, i * 3);
          }
        });
        if (hipsQ || rotT) addRot(tb, times, deltas);
        if (posT) positions.push(new THREE.VectorKeyframeTrack(`${tb.name}.position`, times, pout));
      }
    }
  }

  // Everything else: per-bone rotation by role.
  for (const role of RETARGET_ROLES) {
    if (role === 'hips') continue;
    const sb = resolveRole(srcBones, role, {}, { strict: true })?.bone;
    const rot = sb && trackOf(sb, 'quaternion');
    if (!rot) continue;
    const tb = character.boneStrict(role);
    if (!tb || used.has(tb)) { skipped.push(role); continue; }
    used.add(tb);
    mapped.push(role);
    const C = rotOf(tb).invert().multiply(F).multiply(worldRS(sb).q); // source-local -> target-local
    const Ci = C.clone().invert();
    const sRestInv = sb.quaternion.clone().invert();
    const q = new THREE.Quaternion();
    const deltas = new Float32Array(rot.times.length * 4);
    for (let i = 0; i < rot.times.length; i++) {
      q.fromArray(rot.values, i * 4).premultiply(sRestInv); // change relative to the source rest pose
      q.premultiply(C).multiply(Ci).toArray(deltas, i * 4);
    }
    addRot(tb, Array.from(rot.times), deltas);
  }

  const tracks = [...positions];
  for (const [tb, parts] of rotations) {
    let times = parts[0].times, deltas = parts[0].deltas;
    if (parts.length > 1) { // several sources drive one bone: combine them at common times
      times = mergeTimes(parts.map((p) => p.times));
      const fs = parts.map((p) => sampler(p.times, p.deltas, 4));
      deltas = new Float32Array(times.length * 4);
      const a = [0, 0, 0, 0], acc = new THREE.Quaternion(), q = new THREE.Quaternion();
      times.forEach((t, i) => { acc.identity(); for (const f of fs) acc.multiply(q.fromArray(f(t, a))); acc.toArray(deltas, i * 4); });
    }
    const tRest = character.rest.get(tb).q;
    const out = new Float32Array(deltas.length);
    const q = new THREE.Quaternion();
    for (let i = 0; i < deltas.length; i += 4) q.fromArray(deltas, i).premultiply(tRest).normalize().toArray(out, i);
    tracks.push(new THREE.QuaternionKeyframeTrack(`${tb.name}.quaternion`, Array.from(times), out));
  }
  if (!tracks.length) return null;
  return { clip: new THREE.AnimationClip(label, clip.duration, tracks), method: 'retarget', mapped, skipped };
}
