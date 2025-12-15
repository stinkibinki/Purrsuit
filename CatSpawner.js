import { Transform } from 'engine/core/core.js';
import { quat, vec3 } from 'glm';


export class CatSpawner {
  constructor(scene, {
    markerPrefix = "SPAWN_CAT_",
    count = 10,
    minDistance = 1.0,
  } = {}) {
    this.scene = scene;
    this.markerPrefix = markerPrefix;
    this.count = count;
    this.minDistance = minDistance;

    this.spawnPoints = this._collectSpawnPoints();
  }

  _collectSpawnPoints() {
    return [...this.scene.entitiesByName]
        .filter(([name]) => name.startsWith(this.markerPrefix))
        .map(([_, entity]) => {
          const t = entity.getComponentOfType(Transform);
          return {
            position: vec3.clone(t.translation),
            rotation: quat.clone(t.rotation),
          };
        });
    }

  _getWorldPosition(entity) {
    const t = entity.getComponentOfType(Transform);
    const m = t.worldMatrix ?? t.matrix;
    return [m[12], m[13], m[14]];
  }

  spawn(spawnFn) {
    const points = [...this.spawnPoints];
    this._shuffle(points);

    const chosen = [];
    for (const p of points) {
      if (chosen.length >= this.count) break;
      if (!this._validDistance(p, chosen)) continue;

      spawnFn(p);
      chosen.push(p);
    }
  }

  _validDistance(p, chosen) {
    for (const c of chosen) {
      const dx = p[0] - c[0];
      const dy = p[1] - c[1];
      const dz = p[2] - c[2];
      if (dx*dx + dy*dy + dz*dz < this.minDistance ** 2) {
        return false;
      }
    }
    return true;
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
}
