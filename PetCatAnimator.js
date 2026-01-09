// PetCatAnimator.js
import { vec3, quat } from 'glm';
import { Transform } from 'engine/core/core.js';
import * as Ease from 'engine/animators/EasingFunctions.js';

export class PetCatAnimator {
  constructor(entity, {
    startTime = 0,
    period = 1.0,
    bobY = 0.03,
    yaw = 0.10,
    roll = 0.06,
    phaseLag = 0.10,   // delayed reaction
    enabled = true,
  } = {}) {
    this.entity = entity;
    this.startTime = startTime;
    this.period = period;
    this.bobY = bobY;
    this.yaw = yaw;
    this.roll = roll;
    this.phaseLag = phaseLag;
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

    let phase = (((t - this.startTime) / this.period) % 1 + 1) % 1;
    phase = (phase + this.phaseLag) % 1;
    const p = Ease.sineEaseInOut(phase);

    // Bounce (0..1)
    const bounce = Math.abs(Math.sin(2 * Math.PI * p));

    tr.translation[1] = this.restPos[1] + bounce * this.bobY;

    // Wiggle a bit: yaw + roll slightly offset
    const s1 = Math.sin(2 * Math.PI * p);
    const s2 = Math.sin(2 * Math.PI * ((p + 0.25) % 1));

    const yawQ = quat.create();
    quat.rotateY(yawQ, yawQ, s1 * this.yaw);

    const rollQ = quat.create();
    quat.rotateZ(rollQ, rollQ, s2 * this.roll);

    const rot = quat.create();
    quat.mul(rot, yawQ, this.restRot);
    quat.mul(rot, rollQ, rot);
    tr.rotation = rot;
  }
}
