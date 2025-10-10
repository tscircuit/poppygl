import { mat4 } from "gl-matrix"
import type { DrawCall, GridOptions } from "./types"

export function createGrid(options: GridOptions = {}): DrawCall {
  const size = options.size ?? 10
  const sizeX = typeof size === "number" ? size : size[0]!
  const sizeZ = typeof size === "number" ? size : size[2]!
  const divisions = options.divisions ?? 10
  const color = options.color ?? [0.5, 0.5, 0.5]
  const offset = { x: 0, y: 0, z: 0, ...options.offset }
  const infinite = options.infinite ?? false
  const fadeDistance = options.fadeDistance ?? sizeX / 2

  const positions: number[] = []
  const indices: number[] = []
  const colors: number[] = []
  let vertexIndex = 0

  const halfSizeX = sizeX / 2
  const halfSizeZ = sizeZ / 2
  const stepX = sizeX / divisions
  const stepZ = sizeZ / divisions

  // Helper function to compute fade alpha based on distance from center
  const computeFadeAlpha = (x: number, z: number): number => {
    if (!infinite) return 1.0
    const distance = Math.sqrt(x * x + z * z)
    const fadeStart = fadeDistance * 0.5
    const fadeEnd = fadeDistance
    if (distance < fadeStart) return 1.0
    if (distance > fadeEnd) return 0.0
    return 1.0 - (distance - fadeStart) / (fadeEnd - fadeStart)
  }

  for (let i = 0; i <= divisions; i++) {
    const pX = -halfSizeX + i * stepX
    const pZ = -halfSizeZ + i * stepZ

    // Lines along Z axis
    const alpha1 = computeFadeAlpha(pX, -halfSizeZ)
    const alpha2 = computeFadeAlpha(pX, halfSizeZ)

    positions.push(pX, 0, -halfSizeZ)
    colors.push(color[0]!, color[1]!, color[2]!, alpha1)
    positions.push(pX, 0, halfSizeZ)
    colors.push(color[0]!, color[1]!, color[2]!, alpha2)
    indices.push(vertexIndex++, vertexIndex++)

    // Lines along X axis
    const alpha3 = computeFadeAlpha(-halfSizeX, pZ)
    const alpha4 = computeFadeAlpha(halfSizeX, pZ)

    positions.push(-halfSizeX, 0, pZ)
    colors.push(color[0]!, color[1]!, color[2]!, alpha3)
    positions.push(halfSizeX, 0, pZ)
    colors.push(color[0]!, color[1]!, color[2]!, alpha4)
    indices.push(vertexIndex++, vertexIndex++)
  }

  const model = mat4.create()
  mat4.fromTranslation(model, [offset.x, offset.y, offset.z])

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    normals: null,
    uvs: null,
    model,
    material: {
      baseColorFactor: [...color, 1],
      baseColorTexture: null,
      alphaMode: infinite ? "BLEND" : "OPAQUE",
    },
    colors: infinite ? new Float32Array(colors) : null,
    mode: 1, // 1 = LINES
  }
}
