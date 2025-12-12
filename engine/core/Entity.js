import { quat, vec3 } from 'glm';

import { Transform } from '../core/Transform.js';
import { Parent } from 'engine/core/Parent.js';

export class Entity {

    constructor(components = []) {
        this.components = components;
    }

    addComponent(component) {
        this.components.push(component);
    }

    removeComponent(component) {
        this.components = this.components.filter(c => c !== component);
    }

    removeComponentsOfType(type) {
        this.components = this.components.filter(component => !(component instanceof type));
    }

    getComponentOfType(type) {
        return this.components.find(component => component instanceof type);
    }

    getComponentsOfType(type) {
        return this.components.filter(component => component instanceof type);
    }

    /**
     * Gives the entity a Parent component.
     * Recalculates the position and rotation to be relative to the parent.
     * @param {Entity} parent 
     */
    addParent(parent) {
        const parentTransform = parent.getComponentOfType(Transform);
        const childTransform = this.getComponentOfType(Transform);

        // compute inverse of parent rotation
        const invParentRot = quat.create();
        quat.invert(invParentRot, parentTransform.rotation);

        // local rotation: relative to parent
        const localRotation = quat.create();
        quat.mul(localRotation, invParentRot, childTransform.rotation);

        // local position: relative to parent
        const diff = vec3.create();
        vec3.sub(diff, childTransform.translation, parentTransform.translation);
        const localPosition = vec3.create();
        vec3.transformQuat(localPosition, diff, invParentRot);

        // set local transform
        childTransform.translation = localPosition;
        childTransform.rotation = localRotation;

        this.addComponent(new Parent(parent));
    }

}
