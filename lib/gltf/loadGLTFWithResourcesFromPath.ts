import {
  bufferFromDataURI,
  decodeImageFromBuffer,
  isJPG,
  isPNG,
} from "./resourceUtils"
import type { GLTFResources } from "./types"

export async function loadGLTFWithResourcesFromPath(
  gltfPath: string,
): Promise<{ gltf: any; resources: GLTFResources }> {
  const fs = await import("node:fs/promises")
  const path = await import("node:path")
  const baseDir = path.dirname(gltfPath)
  const gltf = JSON.parse(await fs.readFile(gltfPath, "utf8"))

  const buffers = await Promise.all(
    (gltf.buffers || []).map(async (buffer: any) => {
      if (buffer.uri?.startsWith("data:")) {
        return bufferFromDataURI(buffer.uri)
      }
      if (buffer.uri) {
        const resolved = path.resolve(baseDir, decodeURIComponent(buffer.uri))
        return fs.readFile(resolved)
      }
      throw new Error("Buffer without uri not supported in this loader.")
    }),
  )

  const images = await Promise.all(
    (gltf.images || []).map(async (image: any) => {
      if (image.uri) {
        if (image.uri.startsWith("data:")) {
          const bytes = bufferFromDataURI(image.uri)
          return decodeImageFromBuffer(bytes, image.mimeType)
        }
        const filePath = path.resolve(baseDir, decodeURIComponent(image.uri))
        const fileBytes = await fs.readFile(filePath)
        const hintedMime = isPNG(image.uri)
          ? "image/png"
          : isJPG(image.uri)
            ? "image/jpeg"
            : image.mimeType
        return decodeImageFromBuffer(fileBytes, hintedMime)
      }

      if (typeof image.bufferView === "number") {
        const bufferView = gltf.bufferViews?.[image.bufferView]
        if (!bufferView) {
          throw new Error(`Invalid image bufferView index ${image.bufferView}`)
        }
        const buffer = buffers[bufferView.buffer]
        if (!buffer) {
          throw new Error(
            `Missing buffer for image bufferView ${image.bufferView}`,
          )
        }
        const byteOffset = bufferView.byteOffset ?? 0
        const byteLength = bufferView.byteLength
        if (typeof byteLength !== "number") {
          throw new Error(
            `bufferView ${image.bufferView} missing byteLength for image.`,
          )
        }
        const slice = buffer.subarray(byteOffset, byteOffset + byteLength)
        return decodeImageFromBuffer(slice, image.mimeType)
      }

      throw new Error(
        "images[*] entry missing uri or bufferView; unsupported in this loader.",
      )
    }),
  )

  return {
    gltf,
    resources: {
      buffers,
      images,
    },
  }
}
