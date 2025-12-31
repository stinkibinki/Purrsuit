struct VertexInput {
    @location(0) position: vec3f,
    @location(1) texcoords: vec2f,
    @location(2) normal: vec3f,
    @location(3) tangent: vec3f,
}

struct VertexOutput {
    @builtin(position) clipPosition: vec4f,
    @location(0) position: vec3f,
    @location(1) texcoords: vec2f,
    @location(2) normal: vec3f,
    @location(3) tangent: vec3f,
}

struct FragmentInput {
    @location(0) position: vec3f,
    @location(1) texcoords: vec2f,
    @location(2) normal: vec3f,
    @location(3) tangent: vec3f,
}

struct FragmentOutput {
    @location(0) color: vec4f,
}

struct CameraUniforms {
    viewMatrix: mat4x4f,
    projectionMatrix: mat4x4f,
    position: vec3f,
}

struct Light {
    color: vec3f,     
    position: vec3f,   
    attenuation: vec3f,
    direction: vec3f,
}

struct LightUniforms {
    lights: array<Light, 8>,
}

struct ModelUniforms {
    modelMatrix: mat4x4f,
    normalMatrix: mat3x3f,
}

struct MaterialUniforms {
    baseFactor: vec4f,
    normalFactor: f32,
    metalness: f32,
    roughness: f32,
    emissiveFactor: f32,
    emissiveColor: vec3f,
    hasNormalMap: f32,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

@group(1) @binding(0) var<uniform> model: ModelUniforms;

@group(2) @binding(0) var<uniform> material: MaterialUniforms;
@group(2) @binding(1) var baseTexture: texture_2d<f32>;
@group(2) @binding(2) var baseSampler: sampler;
@group(2) @binding(3) var uNormalTexture: texture_2d<f32>;
@group(2) @binding(4) var uNormalSampler: sampler;

@group(3) @binding(0) var<uniform> lightData: LightUniforms;

const PI = 3.14159265358979;
const GAMMA = 2.2;

fn F_Schlick_vec3f(f0: vec3f, f90: vec3f, VdotH: f32) -> vec3f {
    return f0 + (f90 - f0) * pow(1 - VdotH, 5.0);
}

fn F_Schlick_f32(f0: f32, f90: f32, VdotH: f32) -> f32 {
    return f0 + (f90 - f0) * pow(1 - VdotH, 5.0);
}

fn V_GGX(NdotL: f32, NdotV: f32, roughness: f32) -> f32 {
    let roughnessSq = roughness * roughness;

    let GGXV = NdotV + sqrt(NdotV * NdotV * (1 - roughnessSq) + roughnessSq);
    let GGXL = NdotL + sqrt(NdotL * NdotL * (1 - roughnessSq) + roughnessSq);

    return 1 / (GGXV * GGXL);
}

fn D_GGX(NdotH: f32, roughness: f32) -> f32 {
    let roughnessSq = roughness * roughness;
    let f = (NdotH * NdotH) * (roughnessSq - 1) + 1;
    return roughnessSq / (PI * f * f);
}

fn Fd_Burley(NdotV: f32, NdotL: f32, VdotH: f32, roughness: f32) -> f32 {
    let f90 = 0.5 + 2 * roughness * VdotH * VdotH;
    let lightScatter = F_Schlick_f32(1.0, f90, NdotL);
    let viewScatter = F_Schlick_f32(1.0, f90, NdotV);
    return lightScatter * viewScatter / PI;
}

fn BRDF_diffuse(f0: vec3f, f90: vec3f, diffuseColor: vec3f, VdotH: f32) -> vec3f {
    return (1 - F_Schlick_vec3f(f0, f90, VdotH)) * (diffuseColor / PI);
}

fn BRDF_specular(f0: vec3f, f90: vec3f, roughness: f32, VdotH: f32, NdotL: f32, NdotV: f32, NdotH: f32) -> vec3f{
    let F = F_Schlick_vec3f(f0, f90, VdotH);
    let V = V_GGX(NdotL, NdotV, roughness);
    let D = D_GGX(NdotH, roughness);
    return F * V * D;
}

fn linearTosRGB(color: vec3f) -> vec3f {
    return pow(color, vec3f(1 / GAMMA));
}

fn sRGBToLinear(color: vec3f) -> vec3f {
    return pow(color, vec3f(GAMMA));
}

fn lerp(p0: f32, p1: f32, t: f32) -> f32{
    return p0 * (1 - t) + p1 * t;
}

fn lerp_vec3f(c1: vec3f, c2: vec3f, t: f32) -> vec3f {
    return vec3f(lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t));
}

@vertex
fn vertex(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    output.clipPosition = camera.projectionMatrix * camera.viewMatrix * model.modelMatrix * vec4f(input.position, 1);
    output.position = (model.modelMatrix * vec4f(input.position, 1)).xyz;
    output.texcoords = input.texcoords;
    output.normal = model.normalMatrix * input.normal;
    output.tangent = model.normalMatrix * input.tangent;
    
    return output;
}

@fragment
fn fragment(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;

    let baseColor = textureSample(baseTexture, baseSampler, input.texcoords);
    let normalColor = textureSample(uNormalTexture, uNormalSampler, input.texcoords);

    let surfacePosition = input.position;

    var N = normalize(input.normal);
    
    // normal mapping
    if (material.hasNormalMap > 0.5) {
        let scaledNormal = normalize((normalColor.xyz * 2 - 1) * vec3(vec2(material.normalFactor), 1));
        let T = normalize(input.tangent);
        let B = normalize(cross(N, T));
        let tangentMatrix = mat3x3(T, B, N);
        N = tangentMatrix * scaledNormal;
    }
    
    let V = normalize(camera.position - surfacePosition);

    let f0 = mix(vec3f(0.04), baseColor.rgb, material.metalness);
    let f90 = vec3f(1);
    let diffuseColor = mix(baseColor.rgb, vec3f(0), material.metalness);

    var finalColor = vec3f(0.0);

    for (var i = 0u; i < 8u; i++) {
        let light = lightData.lights[i];

        let d = distance(surfacePosition, light.position);
        let attenuation = 1 / dot(light.attenuation, vec3f(1, d, d * d)); // Ad
        
        let L = normalize(light.position - surfacePosition);
        let H = normalize(L + V);

        var lightColor = light.color;
        
        // make bolt light a spotlight
        if (light.color[0] > 2) {
            let dir = normalize(light.direction);
            let LdotDir = dot(-L, dir);
            let angle = cos(0.5); // snop spotlighta
            var Af = 0.0;
            if (LdotDir > angle) {
                Af = smoothstep(angle, 1.0, LdotDir);
            }
            lightColor = attenuation * light.color * Af; // Il
            
        } else {
            lightColor = attenuation * light.color; // Il
        }

        let NdotL = max(dot(N, L), 0.0);
        let NdotV = max(dot(N, V), 0.0);
        let NdotH = max(dot(N, H), 0.0);
        let VdotH = max(dot(V, H), 0.0);

        let diffuse = lightColor * NdotL * BRDF_diffuse(f0, f90, diffuseColor, VdotH);
        let specular = lightColor * NdotL * BRDF_specular(f0, f90, material.roughness, VdotH, NdotL, NdotV, NdotH);

        finalColor += diffuse + specular;
    
    }
    
    // add emissive lighting
    let emissive = material.emissiveFactor * material.emissiveColor;
    finalColor += emissive;
    
    // add fog
    let dist = distance(camera.position, surfacePosition);
    const e = 2.71828;
    var fogDensity = dist/250; // vecji deljitelj pomeni less thick fog
    let f = 1/pow(pow(e, fogDensity*dist), 2);
    const fogColor = vec3f(0.05, 0.06, 0.08);
    finalColor = lerp_vec3f(fogColor, finalColor, f); // IF U DONT WANT FOG zakomentirej to vrstico

    output.color = vec4f(linearTosRGB(finalColor), baseColor.a);

    return output;
}
