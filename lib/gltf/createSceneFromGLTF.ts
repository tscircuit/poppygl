import { mat4 } from "gl-matrix"
import type { BitmapLike } from "../image/createUint8Bitmap"
import type { GLTFResources, GLTFScene, DrawCall, Material } from "./types"

const COMPONENT_INFO = {
  5120: {
    name: "BYTE",
    size: 1,
    array: Int8Array,
    norm: (v: number) => Math.max(-1, v / 127),
  },
  5121: {
    name: "UNSIGNED_BYTE",
    size: 1,
    array: Uint8Array,
    norm: (v: number) => v / 255,
  },
  5122: {
    name: "SHORT",
    size: 2,
    array: Int16Array,
    norm: (v: number) => Math.max(-1, v / 32767),
  },
  5123: {
    name: "UNSIGNED_SHORT",
    size: 2,
    array: Uint16Array,
    norm: (v: number) => v / 65535,
  },
  5125: {
    name: "UNSIGNED_INT",
    size: 4,
    array: Uint32Array,
    norm: (v: number) => v / 4294967295,
  },
  5126: { name: "FLOAT", size: 4, array: Float32Array, norm: (v: number) => v },
} satisfies Record<
  number,
  {
    name: string
    size: number
    array: any
    norm: (v: number) => number
  }
>

const NUM_COMPONENTS = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
} as const

type AccessorType = keyof typeof NUM_COMPONENTS

type GLTF = any

type ReadAccessorContext = {
  gltf: GLTF
  buffers: Uint8Array[]
}

function getBufferViewSlice(
  ctx: ReadAccessorContext,
  bufferViewIndex: number,
  byteOffset: number,
): { array: Uint8Array; stride: number; byteOffsetInView: number } {
  const { gltf, buffers } = ctx
  const bufferView = gltf.bufferViews?.[bufferViewIndex]
  if (!bufferView)
    throw new Error(`Invalid bufferView index ${bufferViewIndex}`)
  if (typeof bufferView.buffer !== "number")
    throw new Error(`bufferView ${bufferViewIndex} missing buffer reference`)
  const bufferIndex: number = bufferView.buffer
  const buffer = buffers[bufferIndex]!
  if (!buffer) throw new Error(`Missing buffer at index ${bufferIndex}`)
  const viewOffset = bufferView.byteOffset ?? 0
  const totalByteLength =
    bufferView.byteLength ?? buffer.byteLength - viewOffset
  const baseOffset = buffer.byteOffset + viewOffset + byteOffset
  const viewArray = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset + viewOffset,
    totalByteLength,
  )
  return {
    array: new Uint8Array(
      viewArray.buffer,
      baseOffset,
      totalByteLength - byteOffset,
    ),
    stride: bufferView.byteStride ?? 0,
    byteOffsetInView: baseOffset,
  }
}

function readAccessorAsFloat32(
  ctx: ReadAccessorContext,
  accessorIndex: number,
): Float32Array {
  const { gltf } = ctx
  const accessor = gltf.accessors?.[accessorIndex]
  if (!accessor) throw new Error(`Invalid accessor index ${accessorIndex}`)
  if (accessor.sparse) throw new Error("Sparse accessors are not supported.")
  const compInfo =
    COMPONENT_INFO[accessor.componentType as keyof typeof COMPONENT_INFO]
  const numComponents = NUM_COMPONENTS[accessor.type as AccessorType]
  if (!compInfo || !numComponents)
    throw new Error(
      `Unsupported accessor componentType ${accessor.componentType}`,
    )
  const byteOffset = accessor.byteOffset ?? 0
  if (typeof accessor.bufferView !== "number")
    throw new Error(`Accessor ${accessorIndex} missing bufferView`)
  const {
    array: src,
    stride: bufferViewStride,
    byteOffsetInView,
  } = getBufferViewSlice(ctx, accessor.bufferView, byteOffset)
  const stride = bufferViewStride || compInfo.size * numComponents
  const count: number = accessor.count
  const out = new Float32Array(count * numComponents)
  const absoluteByteOffset = byteOffsetInView

  const canUseTightView =
    stride === compInfo.size * numComponents &&
    absoluteByteOffset % compInfo.size === 0
  if (canUseTightView) {
    const TypedArrayCtor = compInfo.array as any
    const typed = new TypedArrayCtor(
      src.buffer,
      src.byteOffset,
      count * numComponents,
    )
    if (compInfo.name === "FLOAT" && !accessor.normalized) {
      return new Float32Array(typed.buffer, typed.byteOffset, typed.length)
    }
    for (let i = 0; i < typed.length; i++) {
      out[i] = accessor.normalized ? compInfo.norm(typed[i]) : typed[i]
    }
    return out
  }

  const dataView = new DataView(src.buffer, src.byteOffset, src.byteLength)
  let outIndex = 0
  for (let i = 0; i < count; i++) {
    const elementOffset = i * stride
    for (let c = 0; c < numComponents; c++) {
      const componentOffset = elementOffset + c * compInfo.size
      let value: number
      switch (accessor.componentType) {
        case 5120:
          value = dataView.getInt8(componentOffset)
          break
        case 5121:
          value = dataView.getUint8(componentOffset)
          break
        case 5122:
          value = dataView.getInt16(componentOffset, true)
          break
        case 5123:
          value = dataView.getUint16(componentOffset, true)
          break
        case 5125:
          value = dataView.getUint32(componentOffset, true)
          break
        case 5126:
          value = dataView.getFloat32(componentOffset, true)
          break
        default:
          throw new Error(`Unknown componentType ${accessor.componentType}`)
      }
      out[outIndex++] = accessor.normalized ? compInfo.norm(value) : value
    }
  }
  return out
}

function readIndices(
  ctx: ReadAccessorContext,
  accessorIndex: number,
): Uint32Array {
  const { gltf } = ctx
  const accessor = gltf.accessors?.[accessorIndex]
  if (!accessor) throw new Error(`Invalid accessor index ${accessorIndex}`)
  if (accessor.type !== "SCALAR")
    throw new Error("Index accessor must be SCALAR")
  const compInfo =
    COMPONENT_INFO[accessor.componentType as keyof typeof COMPONENT_INFO]
  if (!compInfo)
    throw new Error(
      `Unsupported index component type ${accessor.componentType}`,
    )
  if (
    accessor.componentType !== 5121 &&
    accessor.componentType !== 5123 &&
    accessor.componentType !== 5125
  ) {
    throw new Error("Index componentType must be UNSIGNED_BYTE/SHORT/INT")
  }
  const byteOffset = accessor.byteOffset ?? 0
  if (typeof accessor.bufferView !== "number")
    throw new Error(`Index accessor ${accessorIndex} missing bufferView`)
  const {
    array: src,
    stride: bufferViewStride,
    byteOffsetInView,
  } = getBufferViewSlice(ctx, accessor.bufferView, byteOffset)
  const stride = bufferViewStride || compInfo.size
  const count: number = accessor.count
  const absoluteByteOffset = byteOffsetInView
  const canUseTightView =
    stride === compInfo.size && absoluteByteOffset % compInfo.size === 0
  if (canUseTightView) {
    const TypedArrayCtor = compInfo.array as any
    const typed = new TypedArrayCtor(src.buffer, src.byteOffset, count)
    if (accessor.componentType === 5125) {
      return new Uint32Array(typed.buffer, typed.byteOffset, typed.length)
    }
    return new Uint32Array(typed)
  }

  const dataView = new DataView(src.buffer, src.byteOffset, src.byteLength)
  const out = new Uint32Array(count)
  for (let i = 0; i < count; i++) {
    const elementOffset = i * stride
    switch (accessor.componentType) {
      case 5121:
        out[i] = dataView.getUint8(elementOffset)
        break
      case 5123:
        out[i] = dataView.getUint16(elementOffset, true)
        break
      case 5125:
        out[i] = dataView.getUint32(elementOffset, true)
        break
    }
  }
  return out
}

function nodeLocalMatrix(node: any) {
  if (node.matrix) {
    const m = mat4.create()
    for (let i = 0; i < 16; i++) m[i] = node.matrix[i]!
    return m
  }
  const translation = node.translation || [0, 0, 0]
  const rotation = node.rotation || [0, 0, 0, 1]
  const scale = node.scale || [1, 1, 1]
  const m = mat4.create()
  const tmp = mat4.create()
  mat4.fromRotationTranslationScale(tmp, rotation, translation, scale)
  mat4.copy(m, tmp)
  return m
}

function getMaterial(
  gltf: GLTF,
  textures: any[],
  images: BitmapLike[],
  materialIndex: number | undefined,
): Material {
  const material = (gltf.materials || [])[materialIndex ?? -1] || {}
  const pbr = material.pbrMetallicRoughness || {}
  const factor = (pbr.baseColorFactor || [1, 1, 1, 1]) as [
    number,
    number,
    number,
    number,
  ]
  let texImg: BitmapLike | null = null
  if (pbr.baseColorTexture && Number.isInteger(pbr.baseColorTexture.index)) {
    const texIndex = pbr.baseColorTexture.index as number
    const tex = textures[texIndex]
    if (tex && Number.isInteger(tex.source)) {
      const imageIndex = tex.source as number
      texImg = images[imageIndex] || null
    }
  }
  return { baseColorFactor: factor, baseColorTexture: texImg }
}

export function createSceneFromGLTF(
  gltf: GLTF,
  resources: GLTFResources,
): GLTFScene {
  const ctx: ReadAccessorContext = { gltf, buffers: resources.buffers }
  const textures = gltf.textures || []
  const nodes = gltf.nodes || []
  const meshes = gltf.meshes || []
  const scenes = gltf.scenes || []
  const sceneIndex = Number.isInteger(gltf.scene) ? gltf.scene : 0
  const scene = scenes[sceneIndex] || { nodes: [] }

  const drawCalls: DrawCall[] = []

  function traverse(nodeIndex: number, parentMatrix: mat4) {
    const node = nodes[nodeIndex]
    if (!node) return
    const local = nodeLocalMatrix(node)
    const world = mat4.create()
    mat4.multiply(world, parentMatrix, local)

    if (Number.isInteger(node.mesh)) {
      const mesh = meshes[node.mesh]
      if (mesh) {
        for (const primitive of mesh.primitives || []) {
          if (primitive.mode != null && primitive.mode !== 4) continue
          const posAcc = primitive.attributes?.POSITION
          if (posAcc == null) continue
          const normalsAcc = primitive.attributes?.NORMAL
          const uvAcc = primitive.attributes?.TEXCOORD_0

          const positions = readAccessorAsFloat32(ctx, posAcc)
          const normals =
            normalsAcc != null ? readAccessorAsFloat32(ctx, normalsAcc) : null
          const uvs = uvAcc != null ? readAccessorAsFloat32(ctx, uvAcc) : null
          const indices =
            primitive.indices != null
              ? readIndices(ctx, primitive.indices)
              : null
          const material = getMaterial(
            gltf,
            textures,
            resources.images,
            primitive.material,
          )
          drawCalls.push({
            positions,
            normals,
            uvs,
            indices,
            model: world,
            material,
          })
        }
      }
    }

    for (const childIndex of node.children || []) {
      traverse(childIndex, world)
    }
  }

  const identity = mat4.create()
  for (const rootIndex of scene.nodes || []) {
    traverse(rootIndex, identity)
  }

  return { gltf, drawCalls }
}
