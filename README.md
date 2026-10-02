# Character Creator

A static, client-side web app for customising a template character and exporting it as a `.glb` that **keeps its skeleton**, so the result can still be animated. Everything runs in the browser; there is no backend.

Stack: Vite + vanilla JS, with Three.js as the only runtime dependency. Sister project of GLB Composer.

## Run

```sh
npm install
npm run dev       # dev edition: everything, run locally
npm run dev:prod  # production edition on the dev server (to try it out)
npm run build     # production edition, static site in dist/ (what GitHub Pages serves)
npm run build:dev # dev edition as a static site
npm run preview   # serve dist/ locally
npm run placeholder   # regenerate public/models/placeholder.glb (stand-in rig)
```

## Editions

- **Dev** (`npm run dev`): all options. Load your own character, add / remove animations, choose which are exported.
- **Production** (`npm run build`, deployed to GitHub Pages): edits only the default character, **`public/characters/default.glb`**. No character upload, and no adding, removing or editing of animations; all of the model's animations are exported. This keeps the exported model in sync with what the city-scape expects. Accessories can still be dropped in.

The edition is the Vite mode (`IS_PRODUCTION` in `src/config.js`). In dev, `public/models/character.glb` (below) is used if present, otherwise the default character.

## Export simplification

Every export is decimated to about 10,000 triangles in total (`EXPORT_MAX_TRIANGLES` in `src/config.js`) with meshoptimizer, in both editions. The target is a triangle count, not a ratio, so lighter or heavier characters land in the same budget; a character already under it is left alone. Skeleton, skin weights and animations are untouched. Accessories are not decimated.

## Add your template character (dev edition)

Put the rigged character at **`public/models/character.glb`** (or `character.gltf`, with its `.bin`/texture files next to it) and reload. Until it exists, the app shows an empty state where you can pick any `.glb` (or load the generated placeholder) for trying things out.

**glTF input:** `.glb` and `.gltf` both work everywhere a model is accepted (template, accessories, animation files, catalog entries). A `.gltf` with external `.bin` or texture files needs those files selected or dropped **together** with it; they are matched by file name. Embedded (data URI) `.gltf` files work on their own. Export is always a single `.glb`.

Requirements and behaviour:

- Skinned meshes + a skeleton. Embedded animations are picked up automatically (a clip named like "Idle" starts playing).
- **Colours:** every material with a colour is listed and can be recoloured (and its roughness/metalness changed). Flat or greyscale base colour textures tint best, since the colour multiplies the texture.
- **Parts:** every mesh gets an on/off toggle, so hairstyles, clothing variants, etc. can ship in the template as separate meshes.
- **Colours:** a flat (untextured) material shared by several meshes is split per mesh, so each part can be coloured separately. Textured materials stay shared.
- **Proportions:** sliders scale bones (head, arms, hands, legs, feet) plus overall height. They are saved as bone scales, so animations keep working. Sliders only show for bones that are found.
- **Rig:** bone names are parsed loosely into part + side + number, so Mixamo (`mixamorig:LeftHand`), Blender (`hand.L`, `upper_arm.R`) and numbered names (`head_1`, `arm_right_2`) all work. A rig without hand/foot bones falls back to the forearm/arm or lower-leg bones. The **Look → Rig** section shows what was matched, lets you pick a different bone for any role, has a *Show skeleton* toggle and a *Character faces* (+Z / −Z) setting for models without an obvious front. Rig fixes are saved in looks. Synonyms live in `BONE_ROLES` in `src/config.js`.

## Add accessories

Built-in procedural items (hat, glasses, ...) are placeholders. Real ones go in `public/assets/` and are listed in `public/assets/manifest.json`:

```json
{
  "items": [
    {
      "id": "cap-red",
      "name": "Red cap",
      "category": "Hats",
      "file": "hats/cap-red.glb",
      "bone": "head",
      "position": [0, 0.15, 0.01],
      "rotation": [0, 0, 0],
      "scale": 1
    },
    {
      "id": "boot",
      "name": "Boot",
      "category": "Shoes",
      "file": "shoes/boot.glb",
      "bone": "footL",
      "pair": ["footL", "footR"]
    }
  ]
}
```

- `bone` is a role (`head`, `neck`, `chest`, `spine`, `hips`, `handL`, `handR`, `footL`, `footR`, ... see `BONE_ROLES`) or an exact bone name.
- `anchor` (optional) is where on that body part the item attaches: `origin` (the bone's own position, default), `top`, `bottom`, `front`, `back`, `center`, or `outer` (the outer end of an arm). The body part is measured from the vertices that bone drives most.
- `fit` (optional, e.g. `{ "axis": "xz", "ref": 0.19 }`) sizes the item to that body part: the scale becomes (part size on `axis`) / `ref`, where `ref` is the size of the part the item was authored for, in metres. `axis` is `x`, `y`, `z` or `xz` (average of width and depth). Without `fit`, items scale with the character's height.
- `position` / `rotation` (degrees) / `scale` are the placement **relative to the anchor in character space** (up = +Y, front = +Z, left = +X), in metres for a 1.8 m character (see `REF_HEIGHT`). Bone axes do not matter: rigs with rotated or scaled bones (e.g. Sketchfab exports) work, and the item still follows the bone when it animates.
- `pair` equips two copies on the left and right bones; the second is mirrored (negative X scale). If your rig's side bones are not mirrored, adjust or use two separate items.
- Users can fine-tune placement in the app (gizmo or numeric fields), recolour each part of an accessory separately (one colour per material, named after the material, so name the materials in your `.glb`), mirror it to the other side, and drop in their own `.glb` for the session.

Accessories are children of their bone, so they follow animations, and they are exported as children of those bones.

## Animation

The bar at the bottom of the viewport plays, scrubs, loops and changes speed. The **Animate** tab lists clips; drop extra animation `.glb` or `.fbx` files (e.g. Mixamo "without skin") onto the page or use "Add animation files…". Clips must target the same bone names as the template; a ⚠ marks clips that mostly do not match. "In place" removes root motion. Tick which clips are included in the export.

### FBX and other skeletons

Animation files can also be **`.fbx`** (as an animation source only, not as a character or accessory). If a clip's bone names match the template's, it is used as is (position tracks are scaled when the units differ; FBX is in cm). Otherwise it is **retargeted by body part** (hips, spine, chest, neck, head, shoulders, arms, legs; matched strictly by name, no fallback bones). Retargeted clips are marked ⇄ and a message lists the parts that have no counterpart on the character.

- Each bone's rotation change is taken relative to its rest pose and converted between the two rigs' rest orientations. Set **Character faces** in Look → Rig to −Z for models that face the other way; rotations and travel direction follow it.
- **Root motion** (jump, sit, travel) is found on the source hips or the nearest ancestor with a position track (Blender armature nodes often carry it). Whole-body rotation on an ancestor is combined with the hips rotation. Both are scaled by the ratio of the two skeletons' heights and applied to the hips, or to the root bone when the character has no hips bone.

Limits: no retargeting between very different proportions or between an A-pose and a T-pose source (arms end up off by the pose difference); intermediate spine bones (e.g. Spine1) are dropped; fingers and toes are ignored; "In place" only strips root motion on a hips bone, so it does nothing for characters without one. For clips whose bone names already match, only the unit scale is applied, so a character of a very different size will have its hips moved by the wrong amount.

## Export

"Export GLB" writes the character with its full skeleton and skinning in the **rest pose** (not whatever animation frame is playing), the current proportions and colours, accessories as bone children, and the ticked animation clips. Hidden parts and hidden accessories are left out. A warning appears above ~20 MB.

Looks (colours, parts, proportions, catalog accessories) are autosaved in the browser, can be saved/loaded as small `.json` files, and support undo/redo. Custom `.glb` accessories are session-only.

## Configure

`src/config.js`: template/manifest paths, bone aliases, slider ranges, colour palettes, size-warning threshold.

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` builds and publishes on every push to `main`. In the repo, set **Settings → Pages → Source** to **GitHub Actions**. Asset URLs are relative, so the site works at `https://<user>.github.io/<repo>/`. Don't open `dist/index.html` from disk (browsers block module scripts on `file://`); use `npm run preview`.
