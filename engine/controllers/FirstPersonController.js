import { quat, vec3, mat4 } from 'glm';

import { Transform } from '../core/Transform.js';

export class FirstPersonController {

    constructor(entity, domElement, {
        pitch = 0,
        yaw = 0,
        velocity = [0, 0, 0],
        acceleration = 50,
        maxSpeed = 5,
        decay = 0.99999,
        pointerSensitivity = 0.002,
    } = {}) {
        this.entity = entity;
        this.domElement = domElement.querySelector("canvas") ?? domElement;
        this.fullDomElement = domElement;
        this.enabled = false;  // Start disabled, will be enabled after menu closes

        this.pitch = pitch;
        this.yaw = yaw;

        // initialize yaw/pitch from existing GLTF rotation
        const transform = entity.getComponentOfType(Transform);
        if (transform) {
            const q = transform.rotation; // quat [x, y, z, w]

            // pitch (rotation around X)
            const sinp = 2 * (q[3] * q[0] - q[1] * q[2]);
            this.pitch = Math.asin(Math.min(Math.max(sinp, -1), 1));

            // yaw (rotation around Y)
            const siny_cosp = 2 * (q[3] * q[1] + q[2] * q[0]);
            const cosy_cosp = 1 - 2 * (q[1] * q[1] + q[0] * q[0]);
            this.yaw = Math.atan2(siny_cosp, cosy_cosp);
        }

        this.keys = {};

        this.velocity = velocity;
        this.acceleration = acceleration;
        this.maxSpeed = maxSpeed;
        this.decay = decay;
        this.pointerSensitivity = pointerSensitivity;
        
        this.initHandlers();
    }

    initHandlers() {
        this.pointermoveHandler = this.pointermoveHandler.bind(this);
        this.keydownHandler = this.keydownHandler.bind(this);
        this.keyupHandler = this.keyupHandler.bind(this);

        const canvas = this.domElement;
        const playButton = this.fullDomElement.querySelector("#playButton");

        const doc = this.domElement.ownerDocument;

        doc.addEventListener('keydown', this.keydownHandler);
        doc.addEventListener('keyup', this.keyupHandler);
        
        const tryLock = () => {
            canvas.requestPointerLock();
        };

        canvas.addEventListener('click', tryLock);
        playButton.addEventListener('click', tryLock);

        doc.addEventListener('pointerlockchange', e => {
            if (doc.pointerLockElement === canvas) {
                doc.addEventListener('pointermove', this.pointermoveHandler);
            } else {
                doc.removeEventListener('pointermove', this.pointermoveHandler);
            }
        });
    }

    update(t, dt) {
        // Skip input handling if controller is disabled
        if (!this.enabled) {
            return;
        }

        // Calculate forward and right vectors.
        const cos = Math.cos(this.yaw);
        const sin = Math.sin(this.yaw);
        const forward = [-sin, 0, -cos];
        const right = [cos, 0, -sin];

        // Map user input to the acceleration vector.
        const acc = vec3.create();
        if (this.keys['KeyW']) {
            vec3.add(acc, acc, forward);
        }
        if (this.keys['KeyS']) {
            vec3.sub(acc, acc, forward);
        }
        if (this.keys['KeyD']) {
            vec3.add(acc, acc, right);
        }
        if (this.keys['KeyA']) {
            vec3.sub(acc, acc, right);
        }

        // Update velocity based on acceleration.
        vec3.scaleAndAdd(this.velocity, this.velocity, acc, dt * this.acceleration);

        // If there is no user input, apply decay.
        if (!this.keys['KeyW'] &&
            !this.keys['KeyS'] &&
            !this.keys['KeyD'] &&
            !this.keys['KeyA'])
        {
            const decay = Math.exp(dt * Math.log(1 - this.decay));
            vec3.scale(this.velocity, this.velocity, decay);
        }

        // Limit speed to prevent accelerating to infinity and beyond.
        const speed = vec3.length(this.velocity);
        if (speed > this.maxSpeed) {
            vec3.scale(this.velocity, this.velocity, this.maxSpeed / speed);
        }

        const transform = this.entity.getComponentOfType(Transform);
        if (transform) {
            // Update translation based on velocity.
            vec3.scaleAndAdd(transform.translation,
                transform.translation, this.velocity, dt);

            // Update rotation based on the Euler angles.
            const rotation = quat.create();
            quat.rotateY(rotation, rotation, this.yaw);
            quat.rotateX(rotation, rotation, this.pitch);
            transform.rotation = rotation;
        }
    }

    pointermoveHandler(e) {
        // Skip if controller is disabled
        if (!this.enabled) {
            return;
        }

        const dx = e.movementX;
        const dy = e.movementY;

        this.pitch -= dy * this.pointerSensitivity;
        this.yaw   -= dx * this.pointerSensitivity;

        const twopi = Math.PI * 2;
        const halfpi = Math.PI / 2;

        this.pitch = Math.min(Math.max(this.pitch, -halfpi), halfpi);
        this.yaw = ((this.yaw % twopi) + twopi) % twopi;
    }

    keydownHandler(e) {
        this.keys[e.code] = true;
    }

    keyupHandler(e) {
        this.keys[e.code] = false;
    }

    changeSpeed(newSpeed) {
        this.maxSpeed = newSpeed;
    }

    setDefaultSpeed() { this.maxSpeed = 5; }

}
