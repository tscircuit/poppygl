import { encodePNG } from "../image/encodePNG"
import { createSceneFromGLTF } from "../gltf/createSceneFromGLTF"
import { parseGLB } from "../gltf/parseGLB"
import { bufferFromDataURI, decodeImageFromBuffer } from "../gltf/resourceUtils"
import { createUint8Bitmap } from "../image/createUint8Bitmap"
import type { RenderOptionsInput } from "./getDefaultRenderOptions"
import { renderDrawCalls } from "./renderDrawCalls"

export type RenderGLTFToPNGFromGLBOptions = RenderOptionsInput

function normalizeToArrayBuffer(source: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (source instanceof ArrayBuffer) return source
  const { buffer, byteOffset, byteLength } = source
  const viewBuffer = buffer as ArrayBuffer
  return viewBuffer.slice(byteOffset, byteOffset + byteLength)
}

export async function renderGLTFToPNGFromGLB(
  glb: ArrayBuffer | Uint8Array,
  options: RenderGLTFToPNGFromGLBOptions = {},
): Promise<Uint8Array> {
  const arrayBuffer = normalizeToArrayBuffer(glb)
  const { gltf, binaryChunk } = parseGLB(arrayBuffer)

  const totalBuffers = Array.isArray(gltf.buffers) ? gltf.buffers.length : 0
  const buffers: Uint8Array[] = new Array(totalBuffers)

  for (let index = 0; index < totalBuffers; index++) {
    const entry = gltf.buffers[index]
    if (entry?.uri) {
      if (!entry.uri.startsWith("data:")) {
        throw new Error(
          `Buffer ${index} references external resource ${entry.uri}. ` +
            "Use renderGLTFToPNGFromURL for GLBs with external buffer URIs.",
        )
      }
      buffers[index] = bufferFromDataURI(entry.uri)
      continue
    }

    if (!binaryChunk) {
      throw new Error(
        `GLB is missing the binary chunk required for buffer ${index}.`,
      )
    }
    buffers[index] = binaryChunk
  }

  const resolveBufferViewSlice = (bufferViewIndex: number): Uint8Array => {
    const bufferView = gltf.bufferViews?.[bufferViewIndex]
    if (!bufferView) {
      throw new Error(`Invalid bufferView index ${bufferViewIndex}.`)
    }
    const bufferIndex = bufferView.buffer
    const buffer = buffers[bufferIndex]!
    if (!buffer) {
      throw new Error(
        `Missing buffer data for bufferView ${bufferViewIndex} (buffer ${bufferIndex}).`,
      )
    }
    const byteOffset = bufferView.byteOffset ?? 0
    const byteLength = bufferView.byteLength
    if (typeof byteLength !== "number") {
      throw new Error(`bufferView ${bufferViewIndex} is missing byteLength.`)
    }
    return buffer.subarray(byteOffset, byteOffset + byteLength)
  }

  const images = await Promise.all(
    (gltf.images ?? []).map(async (image: any, imageIndex: number) => {
      if (image.uri) {
        if (!image.uri.startsWith("data:")) {
          throw new Error(
            `Image ${imageIndex} references external resource ${image.uri}. ` +
              "Embed textures or load via renderGLTFToPNGFromURL.",
          )
        }
        const imageBytes = bufferFromDataURI(image.uri)
        return decodeImageFromBuffer(imageBytes, image.mimeType)
      }

      if (typeof image.bufferView === "number") {
        const slice = resolveBufferViewSlice(image.bufferView)
        return decodeImageFromBuffer(slice, image.mimeType)
      }

      throw new Error(
        `Image ${imageIndex} must supply a data URI or bufferView for GLB rendering.`,
      )
    }),
  )

  const scene = createSceneFromGLTF(gltf, { buffers, images })
  const { bitmap } = renderDrawCalls(
    scene.drawCalls,
    options,
    createUint8Bitmap,
  )
  return encodePNG(bitmap)
}
