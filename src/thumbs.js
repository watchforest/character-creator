import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

let renderer, scene, camera;

/** Render a small preview image of an object (data URL). */
export function thumbnail(obj, size = 128) {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(size, size, false);
    scene = new THREE.Scene();
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.7;
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.position.set(2, 3, 4);
    scene.add(key);
    camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  }
  scene.add(obj);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj, true);
  const c = box.getCenter(new THREE.Vector3());
  const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.01);
  camera.position.copy(c).add(new THREE.Vector3(0.6, 0.35, 1).normalize().multiplyScalar(r / Math.sin((camera.fov * Math.PI) / 360) * 1.05));
  camera.lookAt(c);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(obj);
  return url;
}
