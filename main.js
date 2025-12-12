import { quat, vec3 } from 'glm';

import { ResizeSystem } from 'engine/systems/ResizeSystem.js';
import { UpdateSystem } from 'engine/systems/UpdateSystem.js';
import { GLTFLoader } from 'engine/loaders/GLTFLoader.js';
import { UnlitRenderer } from 'engine/renderers/UnlitRenderer.js';

import { FirstPersonController } from 'engine/controllers/FirstPersonController.js';
import { Parent } from 'engine/core/Parent.js';

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

const canvas = document.querySelector('canvas');

const renderer = new UnlitRenderer(canvas);
await renderer.initialize();

// load scene data
const gltfLoader = new GLTFLoader();
await gltfLoader.load(new URL('./game/models/map/map.gltf', import.meta.url));

const scene = gltfLoader.loadScene(gltfLoader.defaultScene);

// 1st person camera
const camera = scene.find(node => node.getComponentOfType(Camera));
camera.addComponent(new FirstPersonController(camera, canvas));

// hand + attaching to camera
const hand = scene.getEntityByName("Hand");
hand.addParent(camera);

function update(time, dt) {
    for (const entity of scene) {
        for (const component of entity.components) {
            component.update?.(time, dt);
        }
    }
}

function render() {
    renderer.render(scene, camera);
}

function resize({ displaySize: { width, height }}) {
    camera.getComponentOfType(Camera).aspect = width / height;
}

new ResizeSystem({ canvas, resize }).start();
new UpdateSystem({ update, render }).start();