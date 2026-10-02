import * as THREE from 'three';
import { trackCoverage } from './retarget.js';

export class Animator {
  constructor(character) {
    this.character = character;
    this.mixer = new THREE.AnimationMixer(character.scene);
    this.clips = [];       // { id, clip, source, exportOn, coverage }
    this.currentId = null;
    this.action = null;
    this.playing = false;
    this.speed = 1;
    this.loop = true;
    this.inPlace = false;
    this.nextId = 1;
    this.onChange = () => {};
    this.add(character.animations, 'template');
  }

  add(clips, source) {
    const added = [];
    for (const clip of clips) {
      const entry = { id: this.nextId++, clip, source, exportOn: true, coverage: trackCoverage(clip, this.character.scene) };
      this.clips.push(entry);
      added.push(entry);
    }
    this.onChange();
    return added;
  }

  get current() { return this.clips.find((c) => c.id === this.currentId) || null; }
  get duration() { return this.current ? this.current.clip.duration : 0; }
  get time() { return this.action ? this.action.time : 0; }

  /** Drop root motion (hips x/z) so the character stays in place. */
  prepared(clip) {
    if (!this.inPlace) return clip;
    // Root motion sits on the hips, or on the root bone for rigs without hips (see retarget.js).
    const ch = this.character;
    const carriers = new Set([ch.bone('hips'), ch.bones.find((b) => !(b.parent && b.parent.isBone))].filter(Boolean));
    const c = clip.clone();
    for (const b of carriers) {
      const t = c.tracks.find((x) => x.name === `${b.name}.position`);
      if (!t) continue;
      // Remove the horizontal part of the motion in WORLD space; the track itself is in the parent's (possibly rotated/scaled) frame.
      const pm = b.parent ? (ch.restWorld.get(b.parent) || b.parent.matrixWorld) : null;
      const q = new THREE.Quaternion(), s = new THREE.Vector3();
      if (pm) pm.decompose(new THREE.Vector3(), q, s);
      const k = s.x || 1, qi = q.clone().invert();
      const v = t.values, w = new THREE.Vector3();
      for (let i = 0; i < v.length; i += 3) {
        w.set(v[i] - v[0], v[i + 1] - v[1], v[i + 2] - v[2]).multiplyScalar(k).applyQuaternion(q);
        w.x = 0; w.z = 0;
        w.applyQuaternion(qi).multiplyScalar(1 / k);
        v[i] = v[0] + w.x; v[i + 1] = v[1] + w.y; v[i + 2] = v[2] + w.z;
      }
    }
    return c;
  }

  play(id = this.currentId, { keepTime = false } = {}) {
    const entry = this.clips.find((c) => c.id === id);
    if (!entry) return;
    const prev = this.action;
    const t = keepTime && prev ? prev.time : 0;
    const next = this.mixer.clipAction(this.prepared(entry.clip));
    next.reset();
    next.setLoop(this.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = true;
    next.timeScale = this.speed;
    next.time = t;
    if (prev && prev !== next) {
      if (keepTime) prev.stop();
      else { next.fadeIn(0.2); prev.fadeOut(0.2); this.fading = prev; }
    }
    next.play();
    this.action = next;
    this.currentId = id;
    this.playing = true;
    this.onChange();
  }

  /** Finish any crossfade at once (mixer time does not advance while paused or scrubbing). */
  settle() {
    if (this.fading) { this.fading.stop(); this.fading = null; }
    if (this.action) { this.action.stopFading(); this.action.setEffectiveWeight(1); }
  }

  pause() { if (this.action) { this.settle(); this.action.paused = true; this.playing = false; this.onChange(); } }
  resume() { if (this.action) { this.action.paused = false; this.playing = true; this.onChange(); } }
  toggle() {
    if (!this.action) { const first = this.current || this.clips[0]; if (first) this.play(first.id); return; }
    this.playing ? this.pause() : this.resume();
  }

  stop() {
    this.mixer.stopAllAction();
    this.action = null;
    this.currentId = null;
    this.playing = false;
    this.character.resetPose();
    this.onChange();
  }

  seek(t) {
    if (!this.action) return;
    this.settle();
    this.action.time = t;
    this.mixer.update(0);
  }

  setSpeed(s) { this.speed = s; if (this.action) this.action.timeScale = s; }
  setLoop(on) {
    this.loop = on;
    if (this.action) { this.action.setLoop(on ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); this.action.clampWhenFinished = true; }
  }
  setInPlace(on) { this.inPlace = on; if (this.current) { const p = this.playing; this.play(this.currentId, { keepTime: true }); if (!p) this.pause(); } }

  update(dt) {
    if (!this.action) return;
    this.mixer.update(this.playing ? dt : 0);
    if (this.playing && !this.loop && this.action.time >= this.duration - 1e-3) { this.playing = false; this.onChange(); }
  }

  /** Clips ticked for export. */
  exportClips() { return this.clips.filter((c) => c.exportOn).map((c) => c.clip); }

  snapshot() { return { id: this.currentId, time: this.time, playing: this.playing }; }
  prepareForExport() { this.mixer.stopAllAction(); this.action = null; this.character.resetPose(); }
  restore(s) {
    if (s.id == null) return;
    this.play(s.id, { keepTime: false });
    this.seek(s.time);
    if (!s.playing) this.pause();
  }
}
