import { vec3, mat4 } from 'glm';
import { getGlobalModelMatrix } from 'engine/core/SceneUtils.js';
import { Transform } from 'engine/core/core.js';
import { Model } from 'engine/core/Model.js';
import { FirstPersonController } from 'engine/controllers/FirstPersonController.js';

export class Physics {

    constructor(scene) {
        this.scene = scene;
    }

    update(t, dt, levelBounds) {
        for (const entity of this.scene) {
            if (entity.customProperties?.isDynamic) {
                for (const other of this.scene) {
                    if (entity !== other) {
                        if (other.customProperties?.isStatic) {
                            if (other.customProperties?.isFence) continue; // skip fence (we're hard checking the perimiter instead)
                            this.resolveCollision(entity, other);
                        }

                        if (entity.customProperties?.isPlayer && other.customProperties?.isInteractable) {
                            this.checkInteractionCollision(entity, other);
                        }
                    }
                    
                }
            }

            if (entity.customProperties?.isPlayer && levelBounds != null) {
                this.keepPlayerInBounds(entity, levelBounds, 0.2);
            }
        }
    }

    keepPlayerInBounds(player, bounds, offset = 0.1) {
        const transform = player.getComponentOfType(Transform);
        if (!transform) return;

        // Clamp each axis to stay inside bounds with a small offset
        transform.translation[0] = Math.min(Math.max(transform.translation[0], bounds.min[0] + offset), bounds.max[0] - offset);
        // the middle value is height - don't change it
        //transform.translation[1] = Math.min(Math.max(transform.translation[1], bounds.min[1] + offset), bounds.max[1] - offset);
        transform.translation[2] = Math.min(Math.max(transform.translation[2], bounds.min[2] + offset), bounds.max[2] - offset);
    }

    checkInteractionCollision(p, x) {
        if (x.customProperties?.isInteractable !== true) return;

        const pBox = this.getTransformedAABB(p); // player
        const xBox = this.getInteractionBox(x);

        const isColliding = this.aabbIntersection(pBox, xBox);
        if (!isColliding) return;

        if (x.name == "Bolt") {
            // speed powerup
            const pov = p.getComponentOfType(FirstPersonController);
            pov.changeSpeed(10);

            this.scene.deleteEntity(x);
            // delete bolt light
            const bl = this.scene.entitiesByName.get("BoltLight");
            this.scene.deleteEntity(bl, true);

            this.scene.HUDMessage = "Speed PowerUp Active!";
            this.scene.updateHUD();

            setTimeout((p = pov, sc = this.scene) => {
                sc.HUDMessage = "";
                sc.updateHUD();
                p.setDefaultSpeed();
            }, 10000); // reset speed after 10s
        }
        else {
            // cat pickup
            //console.log("cat time", this.scene.isIKeyPressed);
            if (this.scene.isIKeyPressed) {
                this.scene.isIKeyPressed = false; // da ne zbriše večkrat na en press
                this.scene.numOfCatsCollected++;
                this.scene.updateHUD();
                this.scene.deleteEntity(x); // collect the cat
            }
        }
    }

    getInteractionBox(entity) {
        // "aabb" box centered on x,z coords
        const half = 1.5;
        const t = entity.getComponentOfType(Transform);
        const cx = t.translation[0];
        const cy = t.translation[1];
        const cz = t.translation[2];

        const min = [0, 0, 0];
        const max = [0, 0, 0];

        min[0] = cx - half;
        max[0] = cx + half;

        min[1] = cy - half;
        max[1] = cy + half;

        min[2] = cz - half;
        max[2] = cz + half;

        return { min: min, max: max };
    }

    intervalIntersection(min1, max1, min2, max2) {
        return !(min1 > max2 || min2 > max1);
    }

    aabbIntersection(aabb1, aabb2) {
        return this.intervalIntersection(aabb1.min[0], aabb1.max[0], aabb2.min[0], aabb2.max[0])
            && this.intervalIntersection(aabb1.min[1], aabb1.max[1], aabb2.min[1], aabb2.max[1])
            && this.intervalIntersection(aabb1.min[2], aabb1.max[2], aabb2.min[2], aabb2.max[2]);
    }

    getTransformedAABB(entity, allowedHeight = 1.7, targetWidth = 0.6) {
        if (!entity.aabb) return null;

        // Transform all vertices of the AABB from local to global space.
        const matrix = getGlobalModelMatrix(entity);
        const { min, max } = entity.aabb;

        // Transform all 8 vertices
        const vertices = [
            [min[0], min[1], min[2]],
            [min[0], min[1], max[2]],
            [min[0], max[1], min[2]],
            [min[0], max[1], max[2]],
            [max[0], min[1], min[2]],
            [max[0], min[1], max[2]],
            [max[0], max[1], min[2]],
            [max[0], max[1], max[2]],
        ].map(v => vec3.transformMat4(v, v, matrix));

        // Find new min and max by component.
        const xs = vertices.map(v => v[0]);
        const ys = vertices.map(v => v[1]);
        const zs = vertices.map(v => v[2]);

        const newmin = [Math.min(...xs), Math.min(...ys), Math.min(...zs)];
        const newmax = [Math.max(...xs), Math.max(...ys), Math.max(...zs)];

        // height check
        // trees and lamps need smaller collisions than the their full width
        if (newmax[1] > allowedHeight && newmax[1] < 20) {
            const half = targetWidth * 0.5;

            // aabb centered on x,z coords
            const t = entity.getComponentOfType(Transform);
            const cx = t.translation[0];
            const cz = t.translation[2];

            newmin[0] = cx - half;
            newmax[0] = cx + half;

            newmin[2] = cz - half;
            newmax[2] = cz + half;
        }

        return { min: newmin, max: newmax };
    }

    resolveCollision(a, b) {
        // Get global space AABBs.
        const aBox = this.getTransformedAABB(a);
        const bBox = this.getTransformedAABB(b);

        // Check if there is collision.
        const isColliding = this.aabbIntersection(aBox, bBox);
        /*if (b?.name == "Rock") {
            const dx = Math.max(0, Math.max(aBox.min[0] - bBox.max[0], bBox.min[0] - aBox.max[0]));
            const dy = Math.max(0, Math.max(aBox.min[1] - bBox.max[1], bBox.min[1] - aBox.max[1]));
            const dz = Math.max(0, Math.max(aBox.min[2] - bBox.max[2], bBox.min[2] - aBox.max[2]));
            const d = Math.hypot(dx, dy, dz);
            //console.log("rock colliding", isColliding, d);
            console.log(this.intervalIntersection(aBox.min[1], aBox.max[1], bBox.min[1], bBox.max[1]));
        }*/
        if (!isColliding) {
            return;
        }
        //console.log("entity", a?.name, "|", "other", b?.name);
        //console.log("collision");

        // Move entity A minimally to avoid collision.
        const diffa = vec3.sub(vec3.create(), bBox.max, aBox.min);
        const diffb = vec3.sub(vec3.create(), aBox.max, bBox.min);

        let minDiff = Infinity;
        let minDirection = [0, 0, 0];
        if (diffa[0] >= 0 && diffa[0] < minDiff) {
            minDiff = diffa[0];
            minDirection = [minDiff, 0, 0];
        }
        if (diffa[1] >= 0 && diffa[1] < minDiff) {
            minDiff = diffa[1];
            minDirection = [0, minDiff, 0];
        }
        if (diffa[2] >= 0 && diffa[2] < minDiff) {
            minDiff = diffa[2];
            minDirection = [0, 0, minDiff];
        }
        if (diffb[0] >= 0 && diffb[0] < minDiff) {
            minDiff = diffb[0];
            minDirection = [-minDiff, 0, 0];
        }
        if (diffb[1] >= 0 && diffb[1] < minDiff) {
            minDiff = diffb[1];
            minDirection = [0, -minDiff, 0];
        }
        if (diffb[2] >= 0 && diffb[2] < minDiff) {
            minDiff = diffb[2];
            minDirection = [0, 0, -minDiff];
        }

        const transform = a.getComponentOfType(Transform);
        if (!transform) {
            return;
        }

        vec3.add(transform.translation, transform.translation, minDirection);
    }

}
