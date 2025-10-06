import { mat4 } from "gl-matrix"
import type { DrawCall, GridOptions } from "./types"

export function createGrid(options: GridOptions = {}): DrawCall {
  const size = options.size ?? 10
  const divisions = options.divisions ?? 10
  const color = options.color ?? [0.5, 0.5, 0.5]
  const y = options.y ?? 0
  const center = options.center ?? [0, 0, 0]

  const positions: number[] = []
  const indices: number[] = []
  let vertexIndex = 0

  const halfSize = size / 2
  const step = size / divisions

  for (let i = 0; i <= divisions; i++) {
    const p = -halfSize + i * step

    // Lines along Z axis
    positions.push(p, 0, -halfSize)
    positions.push(p, 0, halfSize)
    indices.push(vertexIndex++, vertexIndex++)

    // Lines along X axis
    positions.push(-halfSize, 0, p)
    positions.push(halfSize, 0, p)
    indices.push(vertexIndex++, vertexIndex++)
  }

  const model = mat4.create()
  mat4.fromTranslation(model, [center[0], y, center[2]])

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
