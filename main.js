import { quat, vec3 } from 'glm';

import { ResizeSystem } from 'engine/systems/ResizeSystem.js';
import { UpdateSystem } from 'engine/systems/UpdateSystem.js';
import { GLTFLoader } from 'engine/loaders/GLTFLoader.js';
import { UnlitRenderer } from 'engine/renderers/UnlitRenderer.js';

import { FirstPersonController } from 'engine/controllers/FirstPersonController.js';
import { Parent } from 'engine/core/Parent.js';
import { Physics } from './Physics.js';
import { BurleyLight } from './BurleyLight.js';
import { CatSpawner } from './CatSpawner.js';
import { createCat } from './CatFactory.js';
import { PetHandAnimator } from './PetHandAnimator.js';
import { SpinAnimator } from './SpinAnimator.js';

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

/**
 * Delete entity from scene (or map)
 * @param {*} delEnt entity to remove
 * @param {boolean} cornerOfShame instead of deleting, it moves the entity off the map
 */
scene.deleteEntity = (delEnt, cornerOfShame = false) => {
    if (!delEnt) return;

    if (cornerOfShame) { // lazy deletion while testing
        const t = delEnt.getComponentOfType(Transform);
        if (t) {
            t.translation[0] = 50; // gre izven mape
        }
    }
    else { // deletus
        const index = scene.indexOf(delEnt);
        if (index !== -1) {
            scene.splice(index, 1);
        }
        
        if (delEnt.name && scene.entitiesByName?.has(delEnt.name)) {
            scene.entitiesByName.delete(delEnt.name);
        }
    }
}

const iKey = 'e'; // interaction
scene.isIKeyPressed = false;
scene.numOfCatsCollected = 0;

// add bolt model to scene
const boltLoader = new GLTFLoader();
await boltLoader.load(new URL('./game/models/powerup/bolt.gltf', import.meta.url));

const boltScene = boltLoader.loadScene(boltLoader.defaultScene);

const bolt = boltScene.getEntityByName("Bolt");

// make the bolt emissive
const boltModel = bolt.getComponentOfType(Model);
if (boltModel) {
    for (const primitive of boltModel.primitives) {
        if (primitive.material) {
            primitive.material.emissiveFactor = 0.003;  // kok mocno glowa bolt
            primitive.material.emissiveColor = [247, 201, 10];
        }
    }
}
bolt.addComponent(new SpinAnimator(bolt, {
  axis: [0, 1, 0], // spin around Y
  speed: 2.0,     // faster spin
}));

scene.push(bolt);
bolt.name = "Bolt";

// add rock model to scene
const rockLoader = new GLTFLoader();
await rockLoader.load(new URL('./game/models/rock/rock.gltf', import.meta.url));

const rockScene = rockLoader.loadScene(rockLoader.defaultScene);

const rock = rockScene.getEntityByName("Rock");

const tRock = rock.getComponentOfType(Transform);
tRock.translation = [6.7, 0.4, 6.2];
tRock.scale = [0.7, 0.7, 0.7];

rock.name = "Rock";
scene.push(rock);

//Load cat prefab (model + template transform + renderer-safe materials)
const catPrefab = await loadCatPrefab('./game/models/cat/cat.gltf', 'Cat');
const NUM_OF_CATS_SPAWNED = 10; // number of cats spawned

//Spawn cats from markers
spawnCatsFromMarkers(scene, catPrefab, {
  markerPrefix: 'SPAWN_CAT_',
  count: NUM_OF_CATS_SPAWNED,  // stevilo mack k se jih spawna
  minDistance: 1.2,
});

// get the integrated cat
const firstCat = scene.getEntityByName("Cat");
firstCat.name = "Cat"; // needed to get registered in interaction
scene.entitiesByName.set("Cat", firstCat);

// 1st person camera
const camera = scene.find(node => node.getComponentOfType(Camera));
camera.addComponent(new FirstPersonController(camera, document.body)); // previously (camera, canvas)
camera.aabb = { // aabb collision limit
    min: [-0.2, -0.8, -0.2],
    max: [0.2, 0.2, 0.2],
};

// main menu
if (true) { // to disable for testing, set to false
  playButton.addEventListener('click', () => {
      mainMenu.classList.add('hidden');
      
      // enable controls after menu closes
      const controller = camera.getComponentOfType(FirstPersonController);
      if (controller) {
          controller.enabled = true;
      }
  });
} else {
  mainMenu.classList.add('hidden');
  const controller = camera.getComponentOfType(FirstPersonController);
  controller.enabled = true;
}

// mark camera as dynamic so physics will handle it
camera.customProperties = camera.customProperties ?? {};
camera.customProperties.isDynamic = true;
camera.customProperties.isPlayer = true;

// hand + attaching to camera
const hand = scene.getEntityByName("Hand");
hand.addParent(camera);
hand.addComponent(new PetHandAnimator(hand, { startTime: 0, enabled: false }));

var kittyCounter = 0;
// collision
const physics = new Physics(scene);
for (const entity of scene) {
    setStaticCollision(entity);

    if (entity.name?.startsWith("Cat") || entity?.name == "Bolt") {
        if (entity.name?.startsWith("Cat")) kittyCounter++;
        entity.customProperties = entity.customProperties ?? {};
        entity.customProperties.isInteractable = true;
    }
}
const NUM_OF_CATS = kittyCounter; // final tally

// park bounds (fence)
const fencePerimeter = computeFencePerimeter(scene);

// add lights to street light models
const lightSources = [...scene.entitiesByName].filter(([name, components]) => name.startsWith('Light_source'));
for (const source of lightSources) {
    let light = new Entity();
    scene.push(light);
    light.addComponent(new Transform({
        translation: [source[1].components[0].translation[0], 3, source[1].components[0].translation[2]]
    }));
    light.addComponent(new BurleyLight());
    //flickering za eno luc
    if (source[0] === "Light_source") {
        light.addComponent({
            update(t, dt) {
              //console.log(t);
              const lightComponent = light.getComponentOfType(BurleyLight);
              if (t % 10 <= 0.5)
                  lightComponent.color = [0, 0, 0];
              else if (t % 10 <= 0.6)
                  lightComponent.color = [255, 255, 255];
              else if (t % 10 <= 0.7)
                  lightComponent.color = [0, 0, 0];
              else
                  lightComponent.color = [255, 255, 255];
            }
        });
    }  
}

// add light to powerup
const boltLight = new Entity();
scene.push(boltLight);
scene.entitiesByName.set("BoltLight", boltLight);
const boltTranslation = bolt.components[0].translation;
//console.log(boltTranslation);
boltLight.addComponent(new Transform({
    translation: [boltTranslation[0], 2, boltTranslation[2]]
}));
boltLight.addComponent(new BurleyLight({
    color: [247, 201, 10],
    intensity: 3,
}));


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

var timerIntervalID = null;
// interaction
document.getElementById("playButton").addEventListener('click', (e) => {
    // timer
    timerIntervalID = setInterval(timer, 1000);

    document.getElementById("hud").classList = "";
    scene.updateHUD();

});

const maxTime = 1 * 60 * 1000;
var time = maxTime;
function timer() {
    time -= 1000; // -1sec
    if (time <= 0) {
        time = 0;
        clearInterval(timerIntervalID); // disable timer
    }
    scene.updateHUD();
}

function disableControls() {
    const controller = camera.getComponentOfType(FirstPersonController);
    if (controller) {
        controller.enabled = false;
    }
}

document.addEventListener('keydown', (e) => {
    scene.isIKeyPressed = e.key == iKey;
    //console.log(scene.numOfCatsCollected, "/", NUM_OF_CATS);
});

document.addEventListener('keyup', (e) => {
    scene.isIKeyPressed = false;
});

scene.HUDMessage = "";
scene.updateHUD = () => {
    document.getElementById("score").textContent = "Cats Left: " + (NUM_OF_CATS - scene.numOfCatsCollected);
    if (NUM_OF_CATS - scene.numOfCatsCollected <= 0) {
        scene.HUDMessage = "You win!";
        clearInterval(timerIntervalID); // disable timer
        disableControls();
        // or a win screen
    }
    else if (time <= 0) {
        scene.HUDMessage = "You're out of time!";
        disableControls();
        // lose screen
    }

    document.getElementById("msg").classList = scene.HUDMessage ? "" : "hidden";
    document.getElementById("msg").textContent = scene.HUDMessage;

    const totalSeconds = Math.max(0, Math.floor(time / 1000));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    document.getElementById("timer").textContent = mins + ":" + secs.toString().padStart(2, "0");

}


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

function setStaticCollision(entity) {
    const model = entity.getComponentOfType(Model);
    if (!model) return;

    const boxes = model.primitives.map(primitive => calculateAxisAlignedBoundingBox(primitive.mesh));
    entity.aabb = mergeAxisAlignedBoundingBoxes(boxes);

    // Mark static so physics will test against it
    entity.customProperties = entity.customProperties ?? {};
    entity.customProperties.isStatic = true;
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

  //console.log('Cat template primitives:', model.primitives?.length);

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