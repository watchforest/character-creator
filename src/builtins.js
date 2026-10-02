// Procedural placeholder accessories so the app is useful before you add real
// models. Authored in metres for a 1.8 m character facing +Z with +Y up. `anchor` picks
// the point on the body part (see AccessoryManager), `fit` sizes the item to that part. Real items go in public/assets/manifest.json instead.
import * as THREE from 'three';

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });
const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; return o; };

function topHat() {
  const g = new THREE.Group();
  const black = mat(0x1b1b22, { name: 'Hat' }), red = mat(0xa8242a, { name: 'Band' });
  g.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.012, 40), black));
  g.add(mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.17, 40), black, 0, 0.091));
  g.add(mesh(new THREE.CylinderGeometry(0.108, 0.108, 0.03, 40), red, 0, 0.03));
  return g;
}

function glasses() {
  const g = new THREE.Group();
  const frame = mat(0x151515, { name: 'Frame', metalness: 0.4, roughness: 0.35 });
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.TorusGeometry(0.034, 0.004, 12, 32), frame, s * 0.043, 0, 0));
    g.add(mesh(new THREE.BoxGeometry(0.004, 0.004, 0.14), frame, s * 0.08, 0, -0.07));
  }
  g.add(mesh(new THREE.BoxGeometry(0.02, 0.004, 0.004), frame));
  return g;
}

function backpack() {
  const g = new THREE.Group();
  const cloth = mat(0x3b6b4a, { name: 'Bag', roughness: 0.9 }), dark = mat(0x23402d, { name: 'Pockets', roughness: 0.9 });
  g.add(mesh(new THREE.BoxGeometry(0.28, 0.36, 0.13), cloth));
  g.add(mesh(new THREE.BoxGeometry(0.26, 0.14, 0.14), dark, 0, 0.1, 0.0));
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.14, 0.04), dark, 0, -0.1, -0.085));
  return g;
}

/* ---- hats ---- */

function cap() {
  const g = new THREE.Group();
  const cloth = mat(0x2a5db0, { name: 'Cap', roughness: 0.85 }), trim = mat(0xf2f2f2, { name: 'Button' });
  g.add(mesh(new THREE.SphereGeometry(0.105, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), cloth));
  g.add(mesh(new THREE.SphereGeometry(0.012, 12, 12), trim, 0, 0.105));
  const brim = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.008, 32, 1, false, -Math.PI / 2, Math.PI), cloth, 0, 0.004, 0.09);
  brim.scale.set(1, 1, 0.9);
  g.add(brim);
  return g;
}

function beanie() {
  const g = new THREE.Group();
  const wool = mat(0xb3322c, { name: 'Wool', roughness: 1 }), cuff = mat(0x8c2622, { name: 'Cuff and pom-pom', roughness: 1 });
  const dome = mesh(new THREE.SphereGeometry(0.104, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), wool, 0, 0.03);
  dome.scale.y = 1.1;
  g.add(dome);
  const band = mesh(new THREE.CylinderGeometry(0.106, 0.106, 0.045, 32, 1, true), cuff, 0, 0.0075);
  band.material.side = THREE.DoubleSide;
  g.add(band);
  g.add(mesh(new THREE.SphereGeometry(0.03, 16, 16), cuff, 0, 0.165));
  return g;
}

function headband() {
  const g = new THREE.Group();
  const ring = mesh(new THREE.TorusGeometry(0.098, 0.011, 10, 40), mat(0xe8e0c8, { name: 'Band', roughness: 0.9 }));
  ring.rotation.x = Math.PI / 2;
  ring.scale.set(1, 1.05, 2);
  g.add(ring);
  return g;
}

function gradCap() {
  const g = new THREE.Group();
  const black = mat(0x15151c, { name: 'Cap', roughness: 0.9 }), gold = mat(0xe0b030, { name: 'Tassel', metalness: 0.6, roughness: 0.4 });
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 32), black, 0, 0.035));
  g.add(mesh(new THREE.BoxGeometry(0.3, 0.012, 0.3), black, 0, 0.076));
  g.add(mesh(new THREE.SphereGeometry(0.012, 12, 12), gold, 0, 0.088));
  // tassel hanging over the left edge
  g.add(mesh(new THREE.BoxGeometry(0.15, 0.003, 0.003), gold, 0.075, 0.088));
  g.add(mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.09, 10), gold, 0.15, 0.04));
  return g;
}

/* ---- face ---- */

function sunglasses() {
  const g = new THREE.Group();
  const frame = mat(0x0c0c0e, { name: 'Frame', roughness: 0.3 }), lens = mat(0x111418, { name: 'Lenses', roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.85 });
  for (const s of [-1, 1]) {
    const l = mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.005, 24), lens, s * 0.045, 0, 0);
    l.rotation.x = Math.PI / 2;
    g.add(l);
    const r = mesh(new THREE.TorusGeometry(0.037, 0.004, 8, 28), frame, s * 0.045, 0, 0);
    g.add(r);
    g.add(mesh(new THREE.BoxGeometry(0.004, 0.006, 0.14), frame, s * 0.083, 0.012, -0.07));
  }
  g.add(mesh(new THREE.BoxGeometry(0.018, 0.005, 0.005), frame, 0, 0.012));
  return g;
}

function readingGlasses() {
  const g = new THREE.Group();
  const frame = mat(0x6b3a1a, { name: 'Frame', roughness: 0.5 });
  for (const s of [-1, 1]) {
    const x = s * 0.045;
    g.add(mesh(new THREE.BoxGeometry(0.07, 0.004, 0.004), frame, x, 0.024));
    g.add(mesh(new THREE.BoxGeometry(0.07, 0.004, 0.004), frame, x, -0.024));
    g.add(mesh(new THREE.BoxGeometry(0.004, 0.052, 0.004), frame, x - 0.035, 0));
    g.add(mesh(new THREE.BoxGeometry(0.004, 0.052, 0.004), frame, x + 0.035, 0));
    g.add(mesh(new THREE.BoxGeometry(0.004, 0.004, 0.14), frame, s * 0.081, 0.024, -0.07));
  }
  g.add(mesh(new THREE.BoxGeometry(0.018, 0.004, 0.004), frame, 0, 0.018));
  return g;
}

function monocle() {
  const g = new THREE.Group();
  const gold = mat(0xd4a017, { name: 'Frame', metalness: 0.9, roughness: 0.25 });
  g.add(mesh(new THREE.TorusGeometry(0.038, 0.004, 10, 32), gold));
  const glass = mesh(new THREE.CircleGeometry(0.036, 24), mat(0xbfe3ff, { name: 'Lens', transparent: true, opacity: 0.25, roughness: 0.05 }));
  glass.material.side = THREE.DoubleSide;
  g.add(glass);
  const chain = mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.2, 6), gold, 0, -0.138, 0);
  g.add(chain);
  return g;
}

function moustache() {
  const g = new THREE.Group();
  const hair = mat(0x2b1d14, { name: 'Hair', roughness: 1 });
  for (const s of [-1, 1]) {
    const m = mesh(new THREE.SphereGeometry(0.022, 14, 10), hair, s * 0.02, 0, 0);
    m.scale.set(1.5, 0.6, 0.6);
    m.rotation.z = s * -0.3;
    g.add(m);
  }
  return g;
}

/* ---- neck & back ---- */

function scarf() {
  const g = new THREE.Group();
  const wool = mat(0xc0392b, { name: 'Scarf', roughness: 1 }), stripe = mat(0xf2f2f2, { name: 'Stripe', roughness: 1 });
  const ring = mesh(new THREE.TorusGeometry(0.085, 0.032, 12, 32), wool);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.15, 0.02), wool, 0.04, -0.075, 0.1));
  g.add(mesh(new THREE.BoxGeometry(0.061, 0.02, 0.022), stripe, 0.04, -0.11, 0.1));
  return g;
}

function satchel() {
  const g = new THREE.Group();
  const leather = mat(0x7a4a24, { name: 'Leather', roughness: 0.7 }), dark = mat(0x5c3718, { name: 'Flap', roughness: 0.7 }), brass = mat(0xd4a017, { name: 'Buckle', metalness: 0.8, roughness: 0.3 });
  g.add(mesh(new THREE.BoxGeometry(0.32, 0.22, 0.09), leather));
  g.add(mesh(new THREE.BoxGeometry(0.33, 0.11, 0.098), dark, 0, 0.055, 0));
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.03, 0.01), brass, 0, 0.0, 0.05));
  return g;
}

/* ---- held (academic) ---- */
// Authored with the grip at the origin and the item along +Y; the default rotation of 90° about X points it forward.

function book() {
  const g = new THREE.Group();
  const cover = mat(0x7b1e2b, { name: 'Cover', roughness: 0.7 }), pages = mat(0xf1ead6, { name: 'Pages', roughness: 1 });
  g.add(mesh(new THREE.BoxGeometry(0.15, 0.21, 0.034), cover, 0, 0.1, 0));
  g.add(mesh(new THREE.BoxGeometry(0.143, 0.203, 0.028), pages, 0.004, 0.1, 0));
  g.add(mesh(new THREE.BoxGeometry(0.006, 0.21, 0.036), mat(0x5e1722, { name: 'Spine', roughness: 0.7 }), -0.072, 0.1, 0));
  return g;
}

function scroll() {
  const g = new THREE.Group();
  const paper = mat(0xe8d9a8, { name: 'Paper', roughness: 1 }), wood = mat(0x6b3a1a, { name: 'Rods' }), ribbon = mat(0xa8242a, { name: 'Ribbon', roughness: 0.7 });
  g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.26, 20), paper, 0, 0.1));
  for (const y of [-0.04, 0.24]) g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 12), wood, 0, y));
  const tie = mesh(new THREE.TorusGeometry(0.024, 0.004, 8, 20), ribbon, 0, 0.1);
  tie.rotation.x = Math.PI / 2;
  g.add(tie);
  return g;
}

function pencil() {
  const g = new THREE.Group();
  const body = mat(0xf2c200, { name: 'Body', roughness: 0.6 });
  g.add(mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.2, 6), body, 0, 0.1));
  g.add(mesh(new THREE.ConeGeometry(0.0065, 0.03, 6), mat(0xe8c9a0, { name: 'Wood tip' }), 0, 0.215));
  g.add(mesh(new THREE.ConeGeometry(0.0022, 0.009, 6), mat(0x222222, { name: 'Lead' }), 0, 0.2325));
  g.add(mesh(new THREE.CylinderGeometry(0.0068, 0.0068, 0.012, 6), mat(0xb0b0b8, { name: 'Ferrule', metalness: 0.8, roughness: 0.3 }), 0, 0.0));
  g.add(mesh(new THREE.CylinderGeometry(0.0066, 0.0066, 0.014, 6), mat(0xe8788a, { name: 'Eraser' }), 0, -0.01));
  return g;
}

function magnifier() {
  const g = new THREE.Group();
  const gold = mat(0xd4a017, { name: 'Frame', metalness: 0.9, roughness: 0.3 }), wood = mat(0x4a2c1a, { name: 'Handle' });
  g.add(mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.12, 12), wood, 0, 0.04));
  g.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 8), gold, 0, 0.125));
  g.add(mesh(new THREE.TorusGeometry(0.055, 0.0045, 10, 32), gold, 0, 0.205));
  const lens = mesh(new THREE.CircleGeometry(0.053, 28), mat(0xbfe3ff, { name: 'Lens', transparent: true, opacity: 0.3, roughness: 0.05 }), 0, 0.205);
  lens.material.side = THREE.DoubleSide;
  g.add(lens);
  return g;
}

function mug() {
  const g = new THREE.Group();
  const ceramic = mat(0xf2f2f2, { name: 'Ceramic', roughness: 0.4 });
  const wall = mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.09, 24, 1, true), ceramic, 0, 0.045);
  wall.material.side = THREE.DoubleSide;
  g.add(wall);
  g.add(mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.006, 24), ceramic, 0, 0.003));
  g.add(mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.002, 24), mat(0x3b2416, { name: 'Coffee', roughness: 0.2 }), 0, 0.078));
  const handle = mesh(new THREE.TorusGeometry(0.02, 0.005, 8, 16, Math.PI * 1.2), ceramic, 0.045, 0.047);
  handle.rotation.z = -Math.PI * 0.6;
  g.add(handle);
  return g;
}

/* ---- more hats ---- */

function beret() {
  const g = new THREE.Group();
  const wool = mat(0x7a1f2b, { name: 'Beret', roughness: 1 }), stalk = mat(0x4f1119, { name: 'Stalk', roughness: 1 });
  const dome = mesh(new THREE.SphereGeometry(0.12, 32, 16), wool, 0.018, 0.0, 0);
  dome.scale.set(1.05, 0.38, 1.05);
  dome.rotation.z = -0.15;
  g.add(dome);
  g.add(mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.025, 8), stalk, 0.03, 0.05));
  return g;
}

function headphones() {
  const g = new THREE.Group();
  const band = mat(0x25252b, { name: 'Band', roughness: 0.5 }), cups = mat(0xc0392b, { name: 'Cups', roughness: 0.4 }), pads = mat(0x15151a, { name: 'Pads', roughness: 1 });
  g.add(mesh(new THREE.TorusGeometry(0.105, 0.007, 10, 36, Math.PI), band, 0, -0.105, 0));
  for (const s of [-1, 1]) {
    const cup = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.022, 24), cups, s * 0.106, -0.105, 0);
    cup.rotation.z = Math.PI / 2;
    const pad = mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.01, 24), pads, s * 0.094, -0.105, 0);
    pad.rotation.z = Math.PI / 2;
    g.add(cup, pad);
  }
  return g;
}

function partyHat() {
  const g = new THREE.Group();
  const cone = mat(0xe84a9a, { name: 'Hat', roughness: 0.7 }), stripe = mat(0xffe27a, { name: 'Stripes', roughness: 0.7 }), pom = mat(0x4ac8e8, { name: 'Pom-pom', roughness: 0.9 });
  g.add(mesh(new THREE.ConeGeometry(0.075, 0.2, 32), cone, 0, 0.1));
  for (const y of [0.05, 0.1, 0.15]) {
    const r = 0.075 * (1 - y / 0.2);
    const t = mesh(new THREE.TorusGeometry(r, 0.004, 6, 32), stripe, 0, y);
    t.rotation.x = Math.PI / 2;
    g.add(t);
  }
  g.add(mesh(new THREE.SphereGeometry(0.018, 12, 12), pom, 0, 0.205));
  return g;
}

function catEars() {
  const g = new THREE.Group();
  const band = mat(0x25252b, { name: 'Band', roughness: 0.5 }), fur = mat(0x3a3a42, { name: 'Ears', roughness: 1 }), inner = mat(0xe8a0b0, { name: 'Inner ear', roughness: 1 });
  g.add(mesh(new THREE.TorusGeometry(0.105, 0.005, 8, 36, Math.PI), band, 0, -0.105, 0));
  for (const s of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.03, 0.06, 4), fur, s * 0.062, 0.01, 0);
    ear.rotation.z = s * -0.25;
    ear.scale.z = 0.5;
    const in2 = mesh(new THREE.ConeGeometry(0.018, 0.04, 4), inner, s * 0.062, 0.005, 0.006);
    in2.rotation.z = s * -0.25;
    in2.scale.z = 0.4;
    g.add(ear, in2);
  }
  return g;
}

/* ---- more face ---- */

function goggles() {
  const g = new THREE.Group();
  const frame = mat(0x2a6fd0, { name: 'Frame', roughness: 0.4 }), lens = mat(0xcfeaff, { name: 'Lenses', roughness: 0.05, transparent: true, opacity: 0.35 });
  g.add(mesh(new THREE.BoxGeometry(0.17, 0.06, 0.012), frame, 0, 0, -0.004));
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(0.07, 0.048, 0.03), lens, s * 0.04, 0, 0.008));
    g.add(mesh(new THREE.BoxGeometry(0.006, 0.04, 0.13), frame, s * 0.085, 0, -0.065));
  }
  return g;
}

function beard() {
  const g = new THREE.Group();
  const hair = mat(0x3b2a20, { name: 'Hair', roughness: 1 });
  const b = mesh(new THREE.SphereGeometry(0.032, 20, 16), hair, 0, -0.012, -0.03);
  b.scale.set(1.3, 1.1, 0.6);
  g.add(b);
  return g;
}

/* ---- more back ---- */

function wings() {
  const g = new THREE.Group();
  const feathers = mat(0xf4f4f8, { name: 'Feathers', roughness: 0.9 }), tips = mat(0xc9d6ee, { name: 'Tips', roughness: 0.9 });
  for (const s of [-1, 1]) {
    const w = mesh(new THREE.SphereGeometry(0.1, 20, 12), feathers, s * 0.17, 0.08, 0);
    w.scale.set(1.8, 1.4, 0.18);
    w.rotation.z = s * 0.5;
    const t = mesh(new THREE.SphereGeometry(0.08, 20, 12), tips, s * 0.26, 0.2, -0.004);
    t.scale.set(1.4, 1.5, 0.16);
    t.rotation.z = s * 0.7;
    g.add(w, t);
  }
  return g;
}

function posterTube() {
  const g = new THREE.Group();
  const tube = mat(0x2f3b52, { name: 'Tube', roughness: 0.6 }), caps = mat(0xe0b030, { name: 'Caps', roughness: 0.5 });
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 20), tube));
  for (const y of [-0.3, 0.3]) g.add(mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.03, 20), caps, 0, y));
  return g;
}

/* ---- more held ---- */

function clipboard() {
  const g = new THREE.Group();
  const board = mat(0x8a5a2b, { name: 'Board', roughness: 0.8 }), paper = mat(0xf7f7f2, { name: 'Paper', roughness: 1 }), clip = mat(0xb0b0b8, { name: 'Clip', metalness: 0.8, roughness: 0.3 });
  g.add(mesh(new THREE.BoxGeometry(0.23, 0.32, 0.012), board, 0, 0.12, 0));
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.27, 0.004), paper, 0, 0.115, -0.008));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.035, 0.022), clip, 0, 0.265, -0.006));
  return g;
}

function laptop() {
  const g = new THREE.Group();
  const lid = mat(0xb8bcc4, { name: 'Case', metalness: 0.7, roughness: 0.35 }), logo = mat(0xf2f2f2, { name: 'Logo', emissive: 0xffffff, emissiveIntensity: 0.4 });
  g.add(mesh(new THREE.BoxGeometry(0.32, 0.22, 0.02), lid, 0, 0.11, 0));
  const dot = mesh(new THREE.CircleGeometry(0.02, 20), logo, 0, 0.11, -0.0105);
  dot.rotation.y = Math.PI;
  g.add(dot);
  return g;
}

function flask() {
  const g = new THREE.Group();
  const glass = mat(0xcfeaff, { name: 'Glass', roughness: 0.05, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  const liquid = mat(0x4ad66d, { name: 'Liquid', roughness: 0.2, transparent: true, opacity: 0.85 });
  const outer = [[0, 0], [0.055, 0], [0.058, 0.004], [0.018, 0.1], [0.018, 0.14], [0.024, 0.148]].map(([x, y]) => new THREE.Vector2(x, y));
  g.add(mesh(new THREE.LatheGeometry(outer, 28), glass));
  const inner = [[0, 0.004], [0.052, 0.004], [0.036, 0.04], [0, 0.04]].map(([x, y]) => new THREE.Vector2(x, y));
  g.add(mesh(new THREE.LatheGeometry(inner, 28), liquid));
  return g;
}

function trophy() {
  const g = new THREE.Group();
  const gold = mat(0xe0b030, { name: 'Gold', metalness: 0.9, roughness: 0.25 }), base = mat(0x4a2c1a, { name: 'Base', roughness: 0.6 });
  g.add(mesh(new THREE.BoxGeometry(0.09, 0.03, 0.09), base, 0, 0.015));
  g.add(mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.06, 12), gold, 0, 0.06));
  const cup = [[0, 0], [0.02, 0.005], [0.05, 0.05], [0.055, 0.09], [0.05, 0.09], [0, 0.01]].map(([x, y]) => new THREE.Vector2(x, y));
  const bowl = mesh(new THREE.LatheGeometry(cup, 28), gold, 0, 0.09);
  bowl.material.side = THREE.DoubleSide;
  g.add(bowl);
  for (const s of [-1, 1]) {
    const handle = mesh(new THREE.TorusGeometry(0.03, 0.005, 8, 16, Math.PI), gold, s * 0.058, 0.14);
    handle.rotation.z = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(handle);
  }
  return g;
}

export const BUILTIN_ITEMS = [
  { id: 'builtin:tophat', name: 'Top hat', category: 'Hats', bone: 'head', anchor: 'top', fit: { axis: 'xz', ref: 0.27 }, position: [0, -0.03, 0], rotation: [0, 0, 0], scale: 1, build: topHat },
  { id: 'builtin:glasses', name: 'Round glasses', category: 'Face', bone: 'head', anchor: 'front', fit: { axis: 'xz', ref: 0.19 }, position: [0, 0.015, 0.012], rotation: [0, 0, 0], scale: 1, build: glasses },
  { id: 'builtin:backpack', name: 'Backpack', category: 'Back', bone: 'chest', anchor: 'back', fit: { axis: 'x', ref: 0.34 }, position: [0, 0, -0.06], rotation: [0, 0, 0], scale: 1, build: backpack },
  { id: 'builtin:cap', name: 'Baseball cap', category: 'Hats', bone: 'head', anchor: 'top', fit: { axis: 'xz', ref: 0.24 }, position: [0, -0.05, 0], rotation: [0, 0, 0], scale: 1, build: cap },
  { id: 'builtin:beanie', name: 'Beanie', category: 'Hats', bone: 'head', anchor: 'top', fit: { axis: 'xz', ref: 0.24 }, position: [0, -0.07, 0], rotation: [0, 0, 0], scale: 1, build: beanie },
  { id: 'builtin:headband', name: 'Headband', category: 'Hats', bone: 'head', anchor: 'top', fit: { axis: 'xz', ref: 0.2 }, position: [0, -0.06, 0], rotation: [0, 0, 0], scale: 1, build: headband },
  { id: 'builtin:gradcap', name: 'Graduation cap', category: 'Hats', bone: 'head', anchor: 'top', fit: { axis: 'xz', ref: 0.24 }, position: [0, -0.06, 0], rotation: [0, 0, 0], scale: 1, build: gradCap },
  { id: 'builtin:sunglasses', name: 'Sunglasses', category: 'Face', bone: 'head', anchor: 'front', fit: { axis: 'xz', ref: 0.19 }, position: [0, 0.015, 0.012], rotation: [0, 0, 0], scale: 1, build: sunglasses },
  { id: 'builtin:readingglasses', name: 'Reading glasses', category: 'Face', bone: 'head', anchor: 'front', fit: { axis: 'xz', ref: 0.19 }, position: [0, 0.015, 0.012], rotation: [0, 0, 0], scale: 1, build: readingGlasses },
  { id: 'builtin:monocle', name: 'Monocle', category: 'Face', bone: 'head', anchor: 'front', fit: { axis: 'xz', ref: 0.19 }, position: [0.043, 0.015, 0.012], rotation: [0, 0, 0], scale: 1, build: monocle },
  { id: 'builtin:moustache', name: 'Moustache', category: 'Face', bone: 'head', anchor: 'front', fit: { axis: 'xz', ref: 0.19 }, position: [0, -0.035, 0.014], rotation: [0, 0, 0], scale: 1, build: moustache },
  { id: 'builtin:scarf', name: 'Scarf', category: 'Neck', bone: 'head', anchor: 'bottom', fit: { axis: 'xz', ref: 0.19 }, position: [0, 0.01, 0], rotation: [0, 0, 0], scale: 1, build: scarf },
  { id: 'builtin:satchel', name: 'Satchel', category: 'Back', bone: 'hips', anchor: 'center', fit: { axis: 'x', ref: 0.34 }, position: [0.19, 0, 0], rotation: [0, 90, 0], scale: 1, build: satchel },
  { id: 'builtin:book', name: 'Book', category: 'Held', bone: 'handR', anchor: 'outer', position: [0, 0, 0], rotation: [90, 0, 0], scale: 1, build: book },
  { id: 'builtin:scroll', name: 'Scroll', category: 'Held', bone: 'handR', anchor: 'outer', position: [0, 0, 0], rotation: [90, 0, 0], scale: 1, build: scroll },
  { id: 'builtin:pencil', name: 'Pencil', category: 'Held', bone: 'handR', anchor: 'outer', position: [0, 0, 0], rotation: [90, 0, 0], scale: 1, build: pencil },
  { id: 'builtin:magnifier', name: 'Magnifying glass', category: 'Held', bone: 'handR', anchor: 'outer', position: [0, 0, 0], rotation: [90, 0, 0], scale: 1, build: magnifier },
  { id: 'builtin:beret', name: 'Beret', category: 'Hats', bone: 'head', anchor: 'top', fit: { axis: 'xz', ref: 0.24 }, position: [0, -0.04, 0], rotation: [0, 0, 0], scale: 1, build: beret },
  { id: 'builtin:headphones', name: 'Headphones', category: 'Hats', bone: 'head', anchor: 'top', fit: { axis: 'xz', ref: 0.2 }, position: [0, 0, 0], rotation: [0, 0, 0], scale: 1, build: headphones },
  { id: 'builtin:partyhat', name: 'Party hat', category: 'Hats', bone: 'head', anchor: 'top', fit: { axis: 'xz', ref: 0.2 }, position: [0, -0.01, 0], rotation: [0, 0, 0], scale: 1, build: partyHat },
  { id: 'builtin:catears', name: 'Cat ears', category: 'Hats', bone: 'head', anchor: 'top', fit: { axis: 'xz', ref: 0.2 }, position: [0, 0, 0], rotation: [0, 0, 0], scale: 1, build: catEars },
  { id: 'builtin:goggles', name: 'Safety goggles', category: 'Face', bone: 'head', anchor: 'front', fit: { axis: 'xz', ref: 0.19 }, position: [0, 0.015, 0.012], rotation: [0, 0, 0], scale: 1, build: goggles },
  { id: 'builtin:beard', name: 'Beard', category: 'Face', bone: 'head', anchor: 'front', fit: { axis: 'xz', ref: 0.19 }, position: [0, -0.07, 0.0], rotation: [0, 0, 0], scale: 1, build: beard },
  { id: 'builtin:wings', name: 'Wings', category: 'Back', bone: 'chest', anchor: 'back', position: [0, 0.05, -0.05], rotation: [0, 0, 0], scale: 1.6, build: wings },
  { id: 'builtin:postertube', name: 'Poster tube', category: 'Back', bone: 'chest', anchor: 'back', position: [0.06, 0, -0.06], rotation: [0, 0, 25], scale: 1, build: posterTube },
  { id: 'builtin:clipboard', name: 'Clipboard', category: 'Held', bone: 'handR', anchor: 'outer', position: [0, 0, 0], rotation: [90, 0, 0], scale: 1, build: clipboard },
  { id: 'builtin:laptop', name: 'Laptop', category: 'Held', bone: 'handR', anchor: 'outer', position: [0, 0, 0], rotation: [90, 0, 0], scale: 1, build: laptop },
  { id: 'builtin:flask', name: 'Flask', category: 'Held', bone: 'handR', anchor: 'outer', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1, build: flask },
  { id: 'builtin:trophy', name: 'Trophy', category: 'Held', bone: 'handR', anchor: 'outer', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1, build: trophy },
  { id: 'builtin:mug', name: 'Coffee mug', category: 'Held', bone: 'handR', anchor: 'outer', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1, build: mug },
].map((i) => ({ ...i, builtin: true }));
