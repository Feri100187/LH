Shader3D Start
{
    type: Shader3D,
    name: LingshuiLakeWater20260920,
    enableInstancing: false,
    supportReflectionProbe: false,
    uniformMap: {
        u_DeepColor: { type: Vector3, default: [0.032, 0.100, 0.092] },
        u_ProbePosition: { type: Vector3, default: [-14, 0.40, -2] },
        u_BoxMin: { type: Vector3, default: [-110, -2, -48] },
        u_BoxMax: { type: Vector3, default: [84, 46, 43] },
        u_SunDirection: { type: Vector3, default: [-0.42, 0.75, 0.51] },
        u_EnvironmentCube: { type: TextureCube },
    },
    shaderPass: [{ pipeline: Forward, VS: LakeVS, FS: LakeFS }]
}
Shader3D End
GLSL Start
#defineGLSL LakeVS

#define SHADER_NAME LingshuiLakeWaterVS
#include "Math.glsl";
#include "Scene.glsl";
#include "SceneFogInput.glsl";
#include "Camera.glsl";
#include "Sprite3DVertex.glsl";
#include "VertexCommon.glsl";
varying vec3 v_WaterPosition;
void main() {
    Vertex vertex;
    getVertexParams(vertex);
    vec4 position = getWorldMatrix() * vec4(vertex.positionOS, 1.0);
    v_WaterPosition = position.xyz / position.w;
    gl_Position = remapPositionZ(getPositionCS(v_WaterPosition));
#ifdef FOG
    FogHandle(gl_Position.z);
#endif
}
#endGLSL
#defineGLSL LakeFS

#define SHADER_NAME LingshuiLakeWaterFS
#include "Color.glsl";
#include "Scene.glsl";
#include "SceneFog.glsl";
#include "Camera.glsl";
#include "Sprite3DFrag.glsl";
varying vec3 v_WaterPosition;

// Four incommensurate wave directions; slow modulation prevents a tile/grid look.
// Analytic slope, no vertex-level wave displacement or expensive normal texture.
vec3 lakeNormal(vec2 p, float dist) {
    float t = u_Time;
    float bend = sin(dot(p, vec2(0.139, -0.181)) + t * 0.23);
    vec2 slope = vec2(0.0);
    slope += vec2(0.933, 0.359) * cos(dot(p, vec2(1.431, 0.551)) + t * 0.64 + bend * 0.4) * 0.033;
    slope += vec2(-0.296, 0.956) * cos(dot(p, vec2(-0.731, 2.361)) - t * 0.83) * 0.028;
    slope += vec2(0.599, 0.801) * cos(dot(p, vec2(3.271, 4.375)) + t * 1.31 + bend) * 0.011;
    // Attenuate high-frequency capillary detail at distance to prevent sparkle aliasing.
    slope += vec2(-0.891, 0.454) * cos(dot(p, vec2(-8.117, 4.136)) - t * 1.79) * 0.006 / (1.0 + dist * 0.06);
    // Fade every frequency, not only capillary detail. At 20/50/100 m the
    // full slope is 0.50 / 0.138 / 0.038 of near-water strength.
    slope *= max(0.025, 1.0 / (1.0 + dist * dist * 0.0025));
    return normalize(vec3(-slope.x, 1.0, -slope.y));
}

vec3 parallaxDirection(vec3 position, vec3 direction) {
    vec3 safeDir = mix(vec3(-1.0), vec3(1.0), step(vec3(0.0), direction)) * max(abs(direction), vec3(0.0001));
    vec3 t0 = (u_BoxMin - position) / safeDir;
    vec3 t1 = (u_BoxMax - position) / safeDir;
    vec3 tmax = max(t0, t1);
    float hit = min(min(tmax.x, tmax.y), tmax.z);
    vec3 projected = position + direction * max(hit, 0.0) - u_ProbePosition;
    // The bounded approximation is useful near lake shores; keep sky directions unwarped.
    return normalize(mix(projected, direction * max(length(projected), 1.0), smoothstep(0.35, 0.8, direction.y)));
}

void main() {
    vec3 p = v_WaterPosition;
    vec3 view = normalize(u_CameraPos - p);
    vec3 normal = lakeNormal(p.xz, length(u_CameraPos - p));
    float noV = clamp(dot(normal, view), 0.0, 1.0);
    float fresnel = 0.02037 + 0.97963 * pow(1.0 - noV, 5.0);
    vec3 reflected = reflect(-view, normal);
    vec3 sampleDir = parallaxDirection(p, reflected) * vec3(-1.0, 1.0, 1.0);
    // Laya's own PBR specularRadiance mirrors cube X for its native cube-face order.
    vec3 env = textureCube(u_EnvironmentCube, sampleDir).rgb;
    vec3 color = mix(u_DeepColor, env, clamp(0.18 + fresnel * 0.80, 0.0, 0.98));
    vec3 halfDir = normalize(view + normalize(u_SunDirection));
    float sun = pow(max(dot(normal, halfDir), 0.0), 160.0);
    color += vec3(1.0, 0.91, 0.73) * sun * 0.16;
#ifdef FOG
    color = scenUnlitFog(color);
#endif
    // Retain partial visibility of submerged shore/rocks. Fresnel raises opacity at a grazing view.
    gl_FragColor = outputTransform(vec4(color, mix(0.83, 0.98, fresnel)));
}
#endGLSL
GLSL End
