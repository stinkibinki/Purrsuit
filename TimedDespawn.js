export class TimedDespawn {
  constructor(entity, scene, {
    duration = 0.6,
    startTime = null,
    onDone = null,
  } = {}) {
    this.entity = entity;
    this.scene = scene;
    this.duration = duration;
    this.startTime = startTime;
    this.onDone = onDone;
    this.done = false;
  }

  update(t, dt) {
    if (this.done) return;
    if (this.startTime == null) this.startTime = t;

    if ((t - this.startTime) >= this.duration) {
      this.done = true;
      this.onDone?.();
      this.scene.deleteEntity(this.entity);
    }
  }
}