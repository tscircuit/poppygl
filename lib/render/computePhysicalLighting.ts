import { clamp } from "../utils/clamp"
import type {
  DirectionalLightSettings,
  HemisphereLightSettings,
} from "./lights-presets"

export interface PhysicalLightingInput {
  baseColor: readonly [number, number, number]
  normal: readonly [number, number, number]
  worldPos: readonly [number, number, number]
  camPos: readonly [number, number, number]
  metalness: number
  roughness: number
  ambientColor?: readonly [number, number, number] | null
  directionalLights?: readonly DirectionalLightSettings[] | null
  hemisphere?: HemisphereLightSettings | null
}

// Single-scatter GGX specular (D_GGX, V_GGX_SmithCorrelated, F_Schlick) matching
// three.js MeshStandardMaterial. Sources:
//   three/src/renderers/shaders/ShaderChunk/lights_physical_pars_fragment.glsl.js
//   three/src/renderers/shaders/ShaderChunk/bsdfs.glsl.js (F_Schlick)
export function computePhysicalLighting(
  input: PhysicalLightingInput,
): [number, number, number] {
  const {
    baseColor,
    normal,
    worldPos,
    camPos,
    ambientColor,
    directionalLights,
    hemisphere,
  } = input

  const materialMetalness = clamp(input.metalness, 0, 1)
  // three.js floors roughness at 0.0525 (lights_physical_fragment.glsl.js).
  const materialRoughness = clamp(input.roughness, 0.0525, 1)

  const f0R = 0.04 + (baseColor[0] - 0.04) * materialMetalness
  const f0G = 0.04 + (baseColor[1] - 0.04) * materialMetalness
  const f0B = 0.04 + (baseColor[2] - 0.04) * materialMetalness

  let irrR = 0
  let irrG = 0
  let irrB = 0

  if (ambientColor) {
    irrR += ambientColor[0]
    irrG += ambientColor[1]
    irrB += ambientColor[2]
  }

  if (hemisphere) {
    const hemiWeight =
      0.5 *
        (normal[0] * hemisphere.dir[0] +
          normal[1] * hemisphere.dir[1] +
          normal[2] * hemisphere.dir[2]) +
      0.5
    irrR +=
      (hemisphere.skyColor[0] +
        (hemisphere.groundColor[0] - hemisphere.skyColor[0]) * hemiWeight) *
      hemisphere.intensity
    irrG +=
      (hemisphere.skyColor[1] +
        (hemisphere.groundColor[1] - hemisphere.skyColor[1]) * hemiWeight) *
      hemisphere.intensity
    irrB +=
      (hemisphere.skyColor[2] +
        (hemisphere.groundColor[2] - hemisphere.skyColor[2]) * hemiWeight) *
      hemisphere.intensity
  }

  let specR = 0
  let specG = 0
  let specB = 0

  if (directionalLights) {
    let vx = camPos[0] - worldPos[0]
    let vy = camPos[1] - worldPos[1]
    let vz = camPos[2] - worldPos[2]
    const vlen = Math.hypot(vx, vy, vz) || 1
    vx /= vlen
    vy /= vlen
    vz /= vlen
    const ndotv = Math.max(0, normal[0] * vx + normal[1] * vy + normal[2] * vz)

    const ggxAlpha = materialRoughness * materialRoughness
    const ggxA2 = ggxAlpha * ggxAlpha

    for (const dl of directionalLights) {
      const lx = dl.dir[0]
      const ly = dl.dir[1]
      const lz = dl.dir[2]
      const ndotl = Math.max(
        0,
        normal[0] * lx + normal[1] * ly + normal[2] * lz,
      )
      irrR += dl.color[0] * dl.intensity * ndotl
      irrG += dl.color[1] * dl.intensity * ndotl
      irrB += dl.color[2] * dl.intensity * ndotl
      if (ndotl <= 0 || ndotv <= 0) continue

      let hx = lx + vx
      let hy = ly + vy
      let hz = lz + vz
      const hlen = Math.hypot(hx, hy, hz) || 1
      hx /= hlen
      hy /= hlen
      hz /= hlen

      const ndoth = Math.max(
        0,
        normal[0] * hx + normal[1] * hy + normal[2] * hz,
      )
      const vdoth = Math.max(0, vx * hx + vy * hy + vz * hz)
      const ggxDenom = ndoth * ndoth * (ggxA2 - 1) + 1
      const ggxDist = ggxA2 / (Math.PI * ggxDenom * ggxDenom)
      const gv = ndotl * Math.sqrt(ggxA2 + (1 - ggxA2) * ndotv * ndotv)
      const gl = ndotv * Math.sqrt(ggxA2 + (1 - ggxA2) * ndotl * ndotl)
      const vis = 0.5 / Math.max(gv + gl, 1e-5)
      const invFres = 1 - vdoth
      const fres = invFres * invFres * invFres * invFres * invFres
      const spec = vis * ggxDist * ndotl * dl.intensity
      specR += dl.color[0] * spec * (f0R + (1 - f0R) * fres)
      specG += dl.color[1] * spec * (f0G + (1 - f0G) * fres)
      specB += dl.color[2] * spec * (f0B + (1 - f0B) * fres)
    }
  }

  const diffScale = 1 - materialMetalness
  const invPi = 1 / Math.PI
  return [
    baseColor[0] * diffScale * irrR * invPi + specR,
    baseColor[1] * diffScale * irrG * invPi + specG,
    baseColor[2] * diffScale * irrB * invPi + specB,
  ]
}
