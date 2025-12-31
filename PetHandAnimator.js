// PetHandAnimator.js
import { vec3, quat } from 'glm';
import { Transform } from 'engine/core/core.js';
import * as Ease from 'engine/animators/EasingFunctions.js';

export class PetHandAnimator {
  constructor(entity, {
    startTime = 0,
    period = 1.5,      // sekunde za loop
    ampX = 0.4,        // amplituda levo-desno
    ampY = 0.06,       // amplituda gor-dol
    roll = 0.2,        // roll zapestja
    enabled = true,
  } = {}) {
    this.entity = entity;
    this.startTime = startTime;
    this.period = period;
    this.ampX = ampX;
    this.ampY = ampY;
    this.roll = roll;
    this.enabled = enabled;

    const tr = entity.getComponentOfType(Transform);
    this.restPos = vec3.clone(tr.translation);
    this.restRot = quat.clone(tr.rotation);
  }

  play() { this.enabled = true; }
  pause() { this.enabled = false; }

  update(t, dt) {
    if (!this.enabled) return;

    const tr = this.entity.getComponentOfType(Transform);
    if (!tr) return;

    // faza 0..1
    const phase = (((t - this.startTime) / this.period) % 1 + 1) % 1;

    // smoother reversal
    const p = Ease.linearEaseInOut(phase);

    // levo-desno
    const side = Math.sin(2 * Math.PI * p);

    // dip more in the middle of the stroke
    const dip = -Math.abs(side);

    tr.translation[0] = this.restPos[0] + side * this.ampX;
    tr.translation[1] = this.restPos[1] + dip  * this.ampY;
    tr.translation[2] = this.restPos[2];

    // wrist roll
    const rollQ = quat.create();
    quat.rotateZ(rollQ, rollQ, side * this.roll);
    quat.mul(tr.rotation, rollQ, this.restRot);
  }
}
