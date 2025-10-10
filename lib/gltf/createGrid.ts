import { mat4 } from "gl-matrix"
import type { DrawCall, GridOptions } from "./types"

interface FadeAlphaOptions {
  x: number
  z: number
  infinite: boolean
  fadeDistance: number
}

// function to compute fade alpha based on distance from center
function computeFadeAlpha(options: FadeAlphaOptions): number {
  const { x, z, infinite, fadeDistance } = options
  if (!infinite) return 1.0
  const distance = Math.sqrt(x * x + z * z)
  const fadeStart = fadeDistance * 0.5
  const fadeEnd = fadeDistance
  if (distance < fadeStart) return 1.0
  if (distance > fadeEnd) return 0.0
  const t = (distance - fadeStart) / (fadeEnd - fadeStart)
  return 1.0 - t * t * (3.0 - 2.0 * t)
}

export function createGrid(options: GridOptions = {}): DrawCall {
  const infinite = options.infinite ?? false
  const baseSize = options.size ?? 10

  // For infinite grids, expand the grid size to create the infinite appearance
  // Only apply multiplier if size wasn't explicitly provided by user
  const size =
    infinite && !options.size
      ? typeof baseSize === "number"
        ? baseSize * 2.5
        : baseSize
      : baseSize

  const sizeX = typeof size === "number" ? size : size[0]!
  const sizeZ = typeof size === "number" ? size : size[2]!
  const divisions = options.divisions ?? 10
  const color = options.color ?? [0.5, 0.5, 0.5]
  const offset = { x: 0, y: 0, z: 0, ...options.offset }

  // Default fade distance: use the max dimension for smooth fade
  const maxDimension = Math.max(sizeX, sizeZ)
  const fadeDistance = options.fadeDistance ?? maxDimension * 0.8

  const positions: number[] = []
  const indices: number[] = []
  const colors: number[] = []
  let vertexIndex = 0

  const halfSizeX = sizeX / 2
  const halfSizeZ = sizeZ / 2
  const stepX = sizeX / divisions
  const stepZ = sizeZ / divisions

  for (let i = 0; i <= divisions; i++) {
    const pX = -halfSizeX + i * stepX
    const pZ = -halfSizeZ + i * stepZ

    // Lines along Z axis
    const alpha1 = computeFadeAlpha({
      x: pX,
      z: -halfSizeZ,
      infinite,
      fadeDistance,
    })
    const alpha2 = computeFadeAlpha({
      x: pX,
      z: halfSizeZ,
      infinite,
      fadeDistance,
    })
    positions.push(pX, 0, -halfSizeZ)
    colors.push(color[0]!, color[1]!, color[2]!, alpha1)
    positions.push(pX, 0, halfSizeZ)
    colors.push(color[0]!, color[1]!, color[2]!, alpha2)
    indices.push(vertexIndex++, vertexIndex++)

    // Lines along X axis
    const alpha3 = computeFadeAlpha({
      x: -halfSizeX,
      z: pZ,
      infinite,
      fadeDistance,
    })
    const alpha4 = computeFadeAlpha({
      x: halfSizeX,
      z: pZ,
      infinite,
      fadeDistance,
    })
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
