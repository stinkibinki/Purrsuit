export class BurleyLight {

    constructor({
        color = [255, 255, 255],
        intensity = 2,
        attenuation = [0.001, 0, 0.3],
        direction = [0, -1, 0],
    } = {}) {
        this.color = color;
        this.intensity = intensity;
        this.attenuation = attenuation;
        this.direction = direction;
    }

}
