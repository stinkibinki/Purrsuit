import { vec3, mat4 } from 'glm';

import * as WebGPU from '../WebGPU.js';

import { Camera, Model } from '../core/core.js';

import {
    getLocalModelMatrix,
    getGlobalModelMatrix,
    getGlobalViewMatrix,
    getProjectionMatrix,
} from '../core/SceneUtils.js';

import { BaseRenderer } from './BaseRenderer.js';

import { BurleyLight } from '../../BurleyLight.js';

const vertexBufferLayout = {
    arrayStride: 48,
    attributes: [
        {
            name: 'position',
            shaderLocation: 0,
            offset: 0,
            format: 'float32x3',
        },
        {
            name: 'texcoords',
            shaderLocation: 1,
            offset: 12,
            format: 'float32x2',
        },
        {
            name: 'normal',
            shaderLocation: 2,
            offset: 20,
            format: 'float32x3',
        },
        {
            name: 'tangent',
            shaderLocation: 3,
            offset: 32,
            format: 'float32x3',
        },
    ],
};

export class UnlitRenderer extends BaseRenderer {

    constructor(canvas) {
        super(canvas);
    }

    async initialize() {
        await super.initialize();

        const code = await fetch(new URL('UnlitRenderer.wgsl', import.meta.url))
            .then(response => response.text());
        const module = this.device.createShaderModule({ code });

        this.pipeline = await this.device.createRenderPipelineAsync({
            layout: 'auto',
            vertex: {
                module,
                buffers: [ vertexBufferLayout ],
            },
            fragment: {
                module,
                targets: [{
                    format: this.format,
                    blend: {
                        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    },
                }],
            },
            depthStencil: {
                format: 'depth24plus',
                depthWriteEnabled: true,
                depthCompare: 'less',
            },
        });

        this.recreateDepthTexture();
    }

    recreateDepthTexture() {
        this.depthTexture?.destroy();
        this.depthTexture = this.device.createTexture({
            format: 'depth24plus',
            size: [this.canvas.width, this.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }

    prepareEntity(entity) {
        if (this.gpuObjects.has(entity)) {
            return this.gpuObjects.get(entity);
        }

        const modelUniformBuffer = this.device.createBuffer({
            size: 128,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const modelBindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(1),
            entries: [
                { binding: 0, resource: modelUniformBuffer },
            ],
        });

        const gpuObjects = { modelUniformBuffer, modelBindGroup };
        this.gpuObjects.set(entity, gpuObjects);
        return gpuObjects;
    }

    prepareCamera(camera) {
        if (this.gpuObjects.has(camera)) {
            return this.gpuObjects.get(camera);
        }

        const cameraUniformBuffer = this.device.createBuffer({
            size: 144,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const cameraBindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: cameraUniformBuffer },
            ],
        });

        const gpuObjects = { cameraUniformBuffer, cameraBindGroup };
        this.gpuObjects.set(camera, gpuObjects);
        return gpuObjects;
    }

    prepareLight(light) {
        if (this.gpuObjects.has(light)) {
            return this.gpuObjects.get(light);
        }

        const lightUniformBuffer = this.device.createBuffer({
            size: 64 * 8,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const lightBindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(3),
            entries: [
                { binding: 0, resource: { buffer: lightUniformBuffer } },
            ],
        });

        const gpuObjects = { lightUniformBuffer, lightBindGroup };
        this.gpuObjects.set(light, gpuObjects);
        return gpuObjects;
    }

    prepareTexture(texture) {
        if (this.gpuObjects.has(texture)) {
            return this.gpuObjects.get(texture);
        }
        
        const { gpuTexture } = this.prepareImage(texture.image); // ignore sRGB
        const { gpuSampler } = this.prepareSampler(texture.sampler);

        const gpuObjects = { gpuTexture, gpuSampler };
        this.gpuObjects.set(texture, gpuObjects);
        return gpuObjects;
    }

    prepareMaterial(material) {
        if (this.gpuObjects.has(material)) {
            return this.gpuObjects.get(material);
        }

        const baseTexture = this.prepareTexture(material.baseTexture);
        const normalTexture = material.normalTexture ? this.prepareTexture(material.normalTexture) : baseTexture;

        const materialUniformBuffer = this.device.createBuffer({
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const materialBindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(2),
            entries: [
                { binding: 0, resource: materialUniformBuffer },
                { binding: 1, resource: baseTexture.gpuTexture },
                { binding: 2, resource: baseTexture.gpuSampler },
                { binding: 3, resource: normalTexture.gpuTexture },
                { binding: 4, resource: normalTexture.gpuSampler },
            ],
        });

        const gpuObjects = { materialUniformBuffer, materialBindGroup };
        this.gpuObjects.set(material, gpuObjects);
        return gpuObjects;
    }

    render(scene, camera) {
        if (this.depthTexture.width !== this.canvas.width || this.depthTexture.height !== this.canvas.height) {
            this.recreateDepthTexture();
        }

        const encoder = this.device.createCommandEncoder();
        this.renderPass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.context.getCurrentTexture(),
                    clearValue: [0.06, 0, 0.15, 1],
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
            depthStencilAttachment: {
                view: this.depthTexture,
                depthClearValue: 1,
                depthLoadOp: 'clear',
                depthStoreOp: 'discard',
            },
        });
        this.renderPass.setPipeline(this.pipeline);

        const cameraComponent = camera.getComponentOfType(Camera);
        const viewMatrix = getGlobalViewMatrix(camera);
        const projectionMatrix = getProjectionMatrix(camera);
        const cameraPosition = mat4.getTranslation(vec3.create(), getGlobalModelMatrix(camera));
        const { cameraUniformBuffer, cameraBindGroup } = this.prepareCamera(cameraComponent);
        this.device.queue.writeBuffer(cameraUniformBuffer, 0, viewMatrix);
        this.device.queue.writeBuffer(cameraUniformBuffer, 64, projectionMatrix);
        this.device.queue.writeBuffer(cameraUniformBuffer, 128, cameraPosition);
        this.renderPass.setBindGroup(0, cameraBindGroup);

        const lights = scene.filter(entity => entity.getComponentOfType(BurleyLight));
        const lightData = new Float32Array(8 * 16);
        let offset = 0;
        var lightComponent = lights[0].getComponentOfType(BurleyLight);
        lights.forEach(light => {
            lightComponent = light.getComponentOfType(BurleyLight);
            const lightColor = vec3.scale(vec3.create(), lightComponent.color, lightComponent.intensity / 255);
            const lightPosition = mat4.getTranslation(vec3.create(),getGlobalModelMatrix(light));
            const lightAttenuation = vec3.clone(lightComponent.attenuation);
            const lightDirection = vec3.clone(lightComponent.direction);

            lightData.set(lightColor, offset);
            lightData.set(lightPosition, offset + 4);
            lightData.set(lightAttenuation, offset + 8);
            lightData.set(lightDirection, offset + 12);
            offset += 16;
        });
        const { lightUniformBuffer, lightBindGroup } = this.prepareLight(lightComponent);
        this.device.queue.writeBuffer(lightUniformBuffer, 0, lightData);
        this.renderPass.setBindGroup(3, lightBindGroup);

        for (const entity of scene) {
            this.renderEntity(entity);
        }

        this.renderPass.end();
        this.device.queue.submit([encoder.finish()]);
    }

    renderEntity(entity) {
        const modelMatrix = getGlobalModelMatrix(entity);
        const normalMatrix = mat4.normalFromMat4(mat4.create(), modelMatrix);

        const { modelUniformBuffer, modelBindGroup } = this.prepareEntity(entity);
        this.device.queue.writeBuffer(modelUniformBuffer, 0, modelMatrix);
        this.device.queue.writeBuffer(modelUniformBuffer, 64, normalMatrix);
        this.renderPass.setBindGroup(1, modelBindGroup);

        for (const model of entity.getComponentsOfType(Model)) {
            this.renderModel(model);
        }
    }

    renderModel(model) {
        for (const primitive of model.primitives) {
            this.renderPrimitive(primitive);
        }
    }

    renderPrimitive(primitive) {
        const material = primitive.material;
        const { materialUniformBuffer, materialBindGroup } = this.prepareMaterial(primitive.material);
        const hasNormalMap = !!material.normalTexture;
        this.device.queue.writeBuffer(materialUniformBuffer, 0, new Float32Array([
            ...material.baseFactor,
            material.normalFactor,
            material.metalnessFactor,
            material.roughnessFactor,
            material.emissiveFactor ?? 0,
            ...(material.emissiveColor ?? [0, 0, 0]),
            hasNormalMap ? 1.0 : 0.0,
        ]));
        this.renderPass.setBindGroup(2, materialBindGroup);

        const { vertexBuffer, indexBuffer } = this.prepareMesh(primitive.mesh, vertexBufferLayout);
        this.renderPass.setVertexBuffer(0, vertexBuffer);
        this.renderPass.setIndexBuffer(indexBuffer, 'uint32');

        this.renderPass.drawIndexed(primitive.mesh.indices.length);
    }

}
