import * as THREE from 'three';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
export const RAD = THREE.MathUtils.DEG2RAD;
export const DEG = THREE.MathUtils.RAD2DEG;
export const round = (v, p = 4) => Math.round(v * 10 ** p) / 10 ** p;

/** Tiny DOM builder. Put `type` before `min/max/step/value` in attrs for range inputs. */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

/** Remove lights and cameras so they never end up in a loaded model or an export. */
export function stripNonGeometry(root) {
  const remove = [];
  root.traverse((o) => { if (o !== root && (o.isLight || o.isCamera)) remove.push(o); });
  remove.forEach((o) => o.parent && o.parent.remove(o));
}

export function toast(msg, kind = 'info', ms = 5000) {
  const el = h('div', { class: `toast ${kind}`, onclick: () => el.remove() }, msg);
  $('#toasts').append(el);
  setTimeout(() => el.remove(), ms);
}

export function download(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export function countTriangles(root) {
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const g = o.geometry;
    n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return Math.round(n);
}
