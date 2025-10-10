import { mat4 } from "gl-matrix"
import type { DrawCall, GridOptions } from "./types"

/**
 * Creates an infinite grid that matches the appearance of the 3d-viewer reference.
 * This grid uses a special rendering approach with procedural generation and fading.
 */
export function createInfiniteGrid(options: GridOptions = {}): DrawCall & {
  isInfiniteGrid: boolean
  cellSize: number
  sectionSize: number
  fadeDistance: number
  fadeStrength: number
  gridColor: readonly [number, number, number]
  sectionColor: readonly [number, number, number]
} {
  // Match 3d-viewer default values
  const cellSize = options.cellSize ?? 1
  const sectionSize = options.sectionSize ?? 10
  const fadeDistance = options.fadeDistance ?? 100
  const fadeStrength = options.fadeStrength ?? 1.5

  // Grid colors from 3d-viewer (light gray for grid, light blue for sections)
  const gridColor = options.gridColor ?? [0.93, 0.93, 0.93] // #eeeeee
  const sectionColor = options.sectionColor ?? [0.8, 0.8, 1.0] // #ccccff

  // Create a large plane for the grid
  const size = 1000
  const positions = new Float32Array([
    -size,
    0,
    -size,
    size,
    0,
    -size,
    size,
    0,
    size,
    -size,
    0,
    size,
  ])

  const indices = new Uint32Array([0, 1, 2, 0, 2, 3])

  const model = mat4.create()
  const offset = options.offset ?? {}
  mat4.fromTranslation(model, [offset.x ?? 0, offset.y ?? 0, offset.z ?? 0])

  return {
    positions,
    indices,
    normals: null,
    uvs: null,
    model,
    material: {
      baseColorFactor: [1, 1, 1, 1],
      baseColorTexture: null,
      alphaMode: "BLEND",
    },
    mode: 4, // triangles
    isInfiniteGrid: true,
    cellSize,
    sectionSize,
    fadeDistance,
    fadeStrength,
    gridColor,
    sectionColor,
  }
}
