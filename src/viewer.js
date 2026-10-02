import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RAD } from './util.js';

export const LIGHTING = {
  studio: { hemi: [0xffffff, 0x404858, 0.55], key: [0xffffff, 2.4], fill: [0x9db8ff, 0.9], rim: [0xffe2c4, 1.8], env: 0.45 },
  day: { hemi: [0xcfe8ff, 0x8a8068, 0.9], key: [0xfff1d6, 3.2], fill: [0xbfd8ff, 0.6], rim: [0xffffff, 0.9], env: 0.8 },
  night: { hemi: [0x30406a, 0x10121a, 0.35], key: [0x7f9bff, 1.0], fill: [0x402060, 0.7], rim: [0xff5fb0, 2.6], env: 0.12 },
};

export function createViewer(canvas, container) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1b1e24');
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

  const hemi = new THREE.HemisphereLight();
  const key = new THREE.DirectionalLight();
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  const fill = new THREE.DirectionalLight();
  const rim = new THREE.DirectionalLight();
  scene.add(hemi, key, key.target, fill, rim);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.02, 200);
  camera.position.set(1.8, 1.4, 3.6);
  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = true;
  orbit.target.set(0, 0.9, 0);
  orbit.autoRotateSpeed = 2;
  orbit.update();

  // Soft shadow catcher + a faint disc so the character does not float in the void.
  const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.35 }));
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.receiveShadow = true;
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 64),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  const stage = new THREE.Group();
  stage.add(disc, shadowCatcher);
  scene.add(stage);

  let lightingName = 'studio';
  let stageSize = 1;
  const callbacks = [];
  const clock = new THREE.Clock();

  function setLighting(name) {
    const p = LIGHTING[name] || LIGHTING.studio;
    lightingName = name;
    hemi.color.set(p.hemi[0]); hemi.groundColor.set(p.hemi[1]); hemi.intensity = p.hemi[2];
    key.color.set(p.key[0]); key.intensity = p.key[1];
    fill.color.set(p.fill[0]); fill.intensity = p.fill[1];
    rim.color.set(p.rim[0]); rim.intensity = p.rim[1];
    scene.environmentIntensity = p.env;
  }
  setLighting('studio');

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  /** Position stage, shadows and lights for a character with this bounding box. */
  function fitStage(box) {
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const h = Math.max(size.y, 0.1);
    stageSize = h;
    stage.position.set(c.x, box.min.y, c.z);
    disc.scale.setScalar(h * 0.55);
    shadowCatcher.scale.setScalar(h * 4);
    shadowCatcher.position.y = 0.0005;
    key.position.set(c.x + h * 1.2, box.min.y + h * 2.2, c.z + h * 1.6);
    key.target.position.copy(c);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -h * 1.3; sc.right = sc.top = h * 1.3;
    sc.near = 0.1; sc.far = h * 8;
    sc.updateProjectionMatrix();
    fill.position.set(c.x - h * 1.5, box.min.y + h * 0.9, c.z + h * 1.2);
    rim.position.set(c.x - h * 0.4, box.min.y + h * 1.6, c.z - h * 1.8);
    fill.target.position.copy(c); rim.target.position.copy(c);
    scene.add(fill.target, rim.target);
    orbit.minDistance = h * 0.25;
    orbit.maxDistance = h * 8;
    camera.near = h * 0.01; camera.far = h * 60;
    camera.updateProjectionMatrix();
  }

  function focus(point, dist, dir) {
    const d = (dir || camera.position.clone().sub(orbit.target)).clone().normalize();
    orbit.target.copy(point);
    camera.position.copy(point).addScaledVector(d, dist);
    orbit.update();
  }

  function frameBox(box) {
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.1);
    focus(c, (r / Math.sin((camera.fov * RAD) / 2)) * 1.05, new THREE.Vector3(0.45, 0.2, 1));
  }

  async function screenshot({ transparent = false, hide = [] } = {}) {
    const bg = scene.background;
    const hidden = hide.map((o) => [o, o.visible]);
    hide.forEach((o) => { o.visible = false; });
    if (transparent) scene.background = null;
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    scene.background = bg;
    hidden.forEach(([o, v]) => { o.visible = v; });
    return blob;
  }

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    callbacks.forEach((fn) => fn(dt));
    orbit.update();
    renderer.render(scene, camera);
  });

  return {
    renderer, scene, camera, orbit, stage,
    onFrame: (fn) => callbacks.push(fn),
    setBackground: (color) => { scene.background = new THREE.Color(color); },
    setLighting, get lighting() { return lightingName; },
    setStageVisible: (v) => { stage.visible = v; },
    setAutoRotate: (v) => { orbit.autoRotate = v; },
    fitStage, focus, frameBox, screenshot,
    get stageSize() { return stageSize; },
  };
}
