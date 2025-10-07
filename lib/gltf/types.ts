import type { mat4, vec3 } from "gl-matrix"
import type { BitmapLike } from "../image/createUint8Bitmap"

export interface Material {
  baseColorFactor: [number, number, number, number]
  baseColorTexture: BitmapLike | null
  emissiveFactor?: vec3
  normalTexture?: {
    index: number
  }
  occlusionTexture?: {
    index: number
  }
  doubleSided?: boolean
  alphaMode?: "OPAQUE" | "MASK" | "BLEND"
  alphaCutoff?: number
}

export interface DrawCall {
  positions: Float32Array
  normals: Float32Array | null
  uvs: Float32Array | null
  indices: Uint32Array | null
  model: mat4
  material: Material
  colors?: Float32Array | null
  mode?: number // glTF primitive mode: 4 = triangles, 1 = lines
}

export interface GridOptions {
  size?: number | readonly [number, number, number]
  divisions?: number
  color?: readonly [number, number, number]
  offset?: Partial<{ x: number; y: number; z: number }>
}

export interface GLTFResources {
  buffers: Uint8Array[]
  images: BitmapLike[]
}

export interface GLTFScene {
  drawCalls: DrawCall[]
  gltf: any
}
