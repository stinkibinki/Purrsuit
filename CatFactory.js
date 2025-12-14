import { vec3, quat } from 'glm';
import { Entity, Transform, Model } from 'engine/core/core.js';

let catId = 0;

export function createCat(
  scene,
  position,
  markerRotation,
  modelTemplate,
  templateRotation,
  templateScale
) {
  const cat = new Entity();
  cat.name = `Cat_${catId++}`;

  const t = new Transform();
  t.translation = vec3.clone(position);
  t.scale = vec3.clone(templateScale);

  // Final rotation = markerRotation × templateRotation × randomYaw
  const rot = quat.clone(markerRotation);

  // Apply mesh orientation correction
  quat.mul(rot, rot, templateRotation);

  t.rotation = rot;

  cat.addComponent(t);

  const model = new Model({ primitives: modelTemplate.primitives });
  cat.addComponent(model);

  scene.push(cat);
  scene.entitiesByName.set(cat.name, cat);

  return cat;
}

export function addEntityToScene(scene, entity) {
  scene.push(entity);
  if (entity.name) scene.entitiesByName.set(entity.name, entity);
  return entity;
}
