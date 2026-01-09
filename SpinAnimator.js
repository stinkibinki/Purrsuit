import { quat } from 'glm';
import { Transform } from 'engine/core/core.js';

export class SpinAnimator {
  constructor(entity, {
    axis = [0, 1, 0], // Y axis by default
    speed = 1.5,     // radians per second
    enabled = true,
  } = {}) {
    this.entity = entity;
    this.axis = axis;
    this.speed = speed;
    this.enabled = enabled;
  }

  play() { this.enabled = true; }
  pause() { this.enabled = false; }

  update(t, dt) {
    if (!this.enabled) return;

    const tr = this.entity.getComponentOfType(Transform);
    if (!tr) return;

    const q = quat.create();

    // rotate around axis * dt
    quat.setAxisAngle(q, this.axis, this.speed * dt);
    quat.mul(tr.rotation, q, tr.rotation);
  }
}
