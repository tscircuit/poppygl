import type { mat4 } from "gl-matrix"
import type { BitmapLike } from "../image/createUint8Bitmap"

export interface Material {
  baseColorFactor: [number, number, number, number]
  baseColorTexture: BitmapLike | null
  /** Repeat rather than clamp the base-color texture (used by section hatching). */
  baseColorTextureWrap?: "repeat" | "clamp"
  metallicFactor?: number
  roughnessFactor?: number
  emissiveFactor?: [number, number, number]
  emissiveTexture?: BitmapLike | null
  emissiveStrength?: number
  alphaMode?: "OPAQUE" | "MASK" | "BLEND"
  alphaCutoff?: number
}

export interface DrawCall {
  /** Generated section cap; preserve its hatch material in outline style. */
  engineeringSectionCap?: boolean
  positions: Float32Array
  normals: Float32Array | null
  uvs: Float32Array | null
  indices: Uint32Array | null
  model: mat4
  material: Material
  colors?: Float32Array | null
  mode?: number // glTF primitive mode: 4 = triangles, 1 = lines
  showHiddenEdges?: boolean
  /** Source triangle third vertices for each extracted edge segment. */
  edgeAdjacentVertices?: number[][]
}

export interface GridOptions {
  size?: number | readonly [number, number, number]
  divisions?: number
  color?: readonly [number, number, number]
  offset?: Partial<{ x: number; y: number; z: number }>
  infiniteGrid?: boolean
  cellSize?: number
  sectionSize?: number
  fadeDistance?: number
  fadeStrength?: number
  gridColor?: readonly [number, number, number]
  sectionColor?: readonly [number, number, number]
}

export interface GLTFResources {
  buffers: Uint8Array[]
  images: BitmapLike[]
}

export interface GLTFScene {
  drawCalls: DrawCall[]
  gltf: any
}
