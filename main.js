import { quat, vec3 } from 'glm';

import { ResizeSystem } from 'engine/systems/ResizeSystem.js';
import { UpdateSystem } from 'engine/systems/UpdateSystem.js';
import { GLTFLoader } from 'engine/loaders/GLTFLoader.js';
import { UnlitRenderer } from 'engine/renderers/UnlitRenderer.js';

import { FirstPersonController } from 'engine/controllers/FirstPersonController.js';
import { Parent } from 'engine/core/Parent.js';
import { Physics } from './Physics.js';
import { BurleyLight } from './BurleyLight.js';
import { CatSpawner } from './catSpawner.js';
import { createCat } from './catFactory.js';

import {
    Camera,
    Entity,
    Material,
    Model,
    Primitive,
    Sampler,
    Texture,
    Transform,
} from 'engine/core/core.js';

import {
    calculateAxisAlignedBoundingBox,
    mergeAxisAlignedBoundingBoxes,
} from 'engine/core/MeshUtils.js';

const canvas = document.querySelector('canvas');

const renderer = new UnlitRenderer(canvas);
await renderer.initialize();

// load scene data
const gltfLoader = new GLTFLoader();
await gltfLoader.load(new URL('./game/models/map/map.gltf', import.meta.url));

const scene = gltfLoader.loadScene(gltfLoader.defaultScene);

//Load cat prefab (model + template transform + renderer-safe materials)
const catPrefab = await loadCatPrefab('./game/models/cat/cat.gltf', 'Cat');

//Spawn cats from markers
spawnCatsFromMarkers(scene, catPrefab, {
  markerPrefix: 'SPAWN_CAT_',
  count: 21,  // stevilo mack k se jih spawna
  minDistance: 1.2,
});

// 1st person camera
const camera = scene.find(node => node.getComponentOfType(Camera));
camera.addComponent(new FirstPersonController(camera, canvas));
camera.aabb = { // aabb collision limit
    min: [-0.2, -0.2, -0.2],
    max: [0.2, 0.2, 0.2],
};

// mark camera as dynamic so physics will handle it
camera.customProperties = camera.customProperties ?? {};
camera.customProperties.isDynamic = true;
camera.customProperties.isPlayer = true;

// hand + attaching to camera
const hand = scene.getEntityByName("Hand");
hand.addParent(camera);

// collision
const physics = new Physics(scene);
for (const entity of scene) {
    const model = entity.getComponentOfType(Model);
    if (!model) continue;

    const boxes = model.primitives.map(primitive => calculateAxisAlignedBoundingBox(primitive.mesh));
    entity.aabb = mergeAxisAlignedBoundingBoxes(boxes);

    // Mark static so physics will test against it
    entity.customProperties = entity.customProperties ?? {};
    entity.customProperties.isStatic = true;
}

// park bounds (fence)
const fencePerimeter = computeFencePerimeter(scene);

// add light
const light = new Entity();
light.addComponent(new Transform({
    translation: [6.2211079597473145, 3, 4.393091678619385],
}));
light.addComponent(new BurleyLight({
    intensity: 3,
}));
scene.push(light);

function update(time, dt) {
    for (const entity of scene) {
        for (const component of entity.components) {
            component.update?.(time, dt);
        }
    }

    physics.update(time, dt, fencePerimeter);
}

function render() {
    renderer.render(scene, camera);
}

function resize({ displaySize: { width, height }}) {
    camera.getComponentOfType(Camera).aspect = width / height;
}

new ResizeSystem({ canvas, resize }).start();
new UpdateSystem({ update, render }).start();


/**
 * Calculates the bounding box of the whole park based on the fences (name: 'SM_Fence_19*') in the scene.
 * @param {*} scene 
 * @returns {*} { min[3], max[3] }  ; [x, y, z]
 */
function computeFencePerimeter(scene) {
    const pieces = [...scene.entitiesByName]
        .filter(([name, entity]) => name.startsWith("SM_Fence_19"))
        .map(([name, entity]) => entity);
    if (pieces.length === 0) return null;

    let min = [ Infinity,  Infinity,  Infinity ];
    let max = [-Infinity, -Infinity, -Infinity ];

    for (const e of pieces) {
        // mark as fence
        e.customProperties = { isStatic: true, isFence: true };

        const model = e.getComponentOfType(Model);
        if (!model) continue;

        const meshes = model.primitives.map(p => calculateAxisAlignedBoundingBox(p.mesh));
        const localAABB = mergeAxisAlignedBoundingBoxes(meshes);

        // Assign local AABB to entity
        e.aabb = localAABB;

        // pass the entity
        const worldAABB = physics.getTransformedAABB(e);

        for (let i = 0; i < 3; i++) {
            min[i] = Math.min(min[i], worldAABB.min[i]);
            max[i] = Math.max(max[i], worldAABB.max[i]);
        }
    }

    return { min, max };
}
async function loadCatPrefab(gltfUrl, nodeName) {
  const loader = new GLTFLoader();
  await loader.load(new URL(gltfUrl, import.meta.url));
  const catScene = loader.loadScene(loader.defaultScene);

  const entity = catScene.getEntityByName(nodeName);
  if (!entity) {
    console.log('catScene names:', [...catScene.entitiesByName.keys()]);
    throw new Error(`Could not find entity named "${nodeName}" in ${gltfUrl}`);
  }

  const model = entity.getComponentOfType(Model);
  if (!model) {
    console.log('Cat entity components:', entity.components);
    throw new Error(`Entity "${nodeName}" exists but has no Model component`);
  }

  const tr = entity.getComponentOfType(Transform);
  const templateRotation = quat.clone(tr.rotation);
  const templateScale = vec3.clone(tr.scale);

  patchUnlitMaterialsWithFallbackTexture(model);

  console.log('Cat template primitives:', model.primitives?.length);

  return { model, templateRotation, templateScale };
}

function patchUnlitMaterialsWithFallbackTexture(model) {
  let fallbackTexture = null;

  for (const prim of model.primitives) {
    const mat = prim.material;
    fallbackTexture =
      mat?.baseColorTexture?.texture ??
      mat?.baseColorTexture ??
      mat?.baseTexture ??
      null;

    if (fallbackTexture) break;
  }

  if (!fallbackTexture) {
    console.warn('No fallback texture found on cat model; unlit renderer may still crash.');
    return;
  }

  for (const prim of model.primitives) {
    const mat = prim.material;
    if (!mat) continue;

    const hasTex =
      mat.baseColorTexture?.texture ||
      mat.baseColorTexture ||
      mat.baseTexture;

    if (!hasTex) {
      mat.baseColorTexture ??= fallbackTexture;
      mat.baseTexture ??= fallbackTexture;
    }
  }
}

function spawnCatsFromMarkers(scene, catPrefab, { markerPrefix, count, minDistance }) {
  const spawner = new CatSpawner(scene, { markerPrefix, count, minDistance });

  spawner.spawn(spawn => {
    createCat(
      scene,
      spawn.position,
      spawn.rotation,
      catPrefab.model,
      catPrefab.templateRotation,
      catPrefab.templateScale
    );
  });

  console.log('Scene entity count after spawning:', scene.length);
  console.log('Cats in entitiesByName:', [...scene.entitiesByName.keys()].filter(k => k.startsWith('Cat_')));
}