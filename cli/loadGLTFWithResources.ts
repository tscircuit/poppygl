import * as fs from "node:fs"
import * as path from "node:path"
import type { BitmapLike } from "../lib/image/createUint8Bitmap"
import type { GLTFResources } from "../lib/gltf/types"
import {
  bufferFromDataURI,
  decodeImageFromBuffer,
  isJPG,
  isPNG,
} from "../lib/gltf/resourceUtils"

export async function loadGLTFWithResources(gltfPath: string): Promise<{
  gltf: any
  resources: GLTFResources
}> {
  const baseDir = path.dirname(gltfPath)
  const gltf = JSON.parse(await fs.promises.readFile(gltfPath, "utf8"))

  const buffers = await Promise.all(
    (gltf.buffers || []).map(async (b: any) => {
      if (b.uri && b.uri.startsWith("data:")) {
        const buffer = bufferFromDataURI(b.uri)
        return Buffer.from(buffer)
      } else if (b.uri) {
        const resolved = path.resolve(baseDir, decodeURIComponent(b.uri))
        const buffer = await fs.promises.readFile(resolved)
        return buffer
      } else {
        throw new Error("Buffer without uri not supported in this loader.")
      }
    }),
  )

  const images = await Promise.all(
    (gltf.images || []).map(async (img: any) => {
      if (img.uri) {
        if (img.uri.startsWith("data:")) {
          const buf = bufferFromDataURI(img.uri)
          return decodeImageFromBuffer(buf, img.mimeType)
        }
        const filePath = path.resolve(baseDir, decodeURIComponent(img.uri))
        const fileBuf = await fs.promises.readFile(filePath)
        const hintedMime = isPNG(img.uri)
          ? "image/png"
          : isJPG(img.uri)
            ? "image/jpeg"
            : img.mimeType
        return decodeImageFromBuffer(fileBuf, hintedMime)
      }

      if (typeof img.bufferView === "number") {
        const bufferView = gltf.bufferViews?.[img.bufferView]
        if (!bufferView) {
          throw new Error(`Invalid image bufferView index ${img.bufferView}`)
        }
        const buffer = buffers[bufferView.buffer]
        if (!buffer)
          throw new Error(
            `Missing buffer for image bufferView ${img.bufferView}`,
          )
        const byteOffset = bufferView.byteOffset ?? 0
        const byteLength = bufferView.byteLength
        if (typeof byteLength !== "number") {
          throw new Error(
            `bufferView ${img.bufferView} missing byteLength for image.`,
          )
        }
        const slice = Buffer.from(
          buffer.buffer,
          buffer.byteOffset + byteOffset,
          byteLength,
        )
        return decodeImageFromBuffer(slice, img.mimeType)
      }

      throw new Error(
        "images[*] entry missing uri or bufferView; unsupported in this lightweight loader.",
      )
    }) as Promise<BitmapLike>[],
  )

  return {
    gltf,
    resources: {
      buffers,
      images,
    },
  }
}
