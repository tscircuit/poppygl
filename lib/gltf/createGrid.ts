import { mat4 } from "gl-matrix"
import type { DrawCall, GridOptions } from "./types"

export function createGrid(options: GridOptions = {}): DrawCall {
  const size = options.size ?? 10
  const sizeX = typeof size === "number" ? size : size[0]!
  const sizeZ = typeof size === "number" ? size : size[2]!
  const divisions = options.divisions ?? 10
  const color = options.color ?? [0.5, 0.5, 0.5]
  const offset = { x: 0, y: 0, z: 0, ...options.offset }

  const positions: number[] = []
  const indices: number[] = []
  let vertexIndex = 0

  const halfSizeX = sizeX / 2
  const halfSizeZ = sizeZ / 2
  const stepX = sizeX / divisions
  const stepZ = sizeZ / divisions

  for (let i = 0; i <= divisions; i++) {
    const pX = -halfSizeX + i * stepX
    const pZ = -halfSizeZ + i * stepZ

    // Lines along Z axis
    positions.push(pX, 0, -halfSizeZ)
    positions.push(pX, 0, halfSizeZ)
    indices.push(vertexIndex++, vertexIndex++)

    // Lines along X axis
    positions.push(-halfSizeX, 0, pZ)
    positions.push(halfSizeX, 0, pZ)
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
    },
    mode: 1, // 1 = LINES
  }
}
