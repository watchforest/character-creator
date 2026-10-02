import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { countTriangles } from './util.js';
import { simplifyForExport } from './simplify.js';

export function exportStats(character) {
  let skinned = 0;
  character.scene.traverse((o) => { if (o.isSkinnedMesh && o.visible) skinned++; });
  return { triangles: countTriangles(character.scene), bones: character.bones.length, skinnedMeshes: skinned };
}

/**
 * Export the character with its skeleton, current proportions, accessories (as
 * children of their bones) and the ticked animation clips. The pose is reset to
 * the rest pose first so the file does not contain a random animation frame.
 * The body meshes are decimated to the triangle budget (see simplify.js).
 */
export async function exportCharacter({ character, animator, includeAnimations }) {
  const snap = animator.snapshot();
  animator.prepareForExport();
  character.scene.updateMatrixWorld(true);
  let simplified = { before: 0, restore() {} };
  try {
    simplified = await simplifyForExport(character.scene);
    const animations = includeAnimations ? animator.exportClips() : [];
    const buffer = await new Promise((resolve, reject) => {
      new GLTFExporter().parse(character.scene, resolve, reject, {
        binary: true,
        onlyVisible: true,
        animations,
      });
    });
    return { buffer, animations: animations.length, trianglesBefore: simplified.before, ...exportStats(character) };
  } finally {
    simplified.restore();
    animator.restore(snap);
  }
}
