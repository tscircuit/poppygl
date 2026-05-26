import { createSceneFromGLTF } from "../gltf/createSceneFromGLTF"
import {
  bufferFromDataURI,
  decodeImageFromBuffer,
  isJPG,
  isPNG,
} from "../gltf/resourceUtils"
import type { GLTFResources } from "../gltf/types"
import { encodePNGToBuffer } from "../image/encodePNGToBuffer"
import { pureImageFactory } from "../image/pureImageFactory"
import type { RenderOptionsInput } from "./getDefaultRenderOptions"
import { renderGLTFToPNGBufferFromURL } from "./renderGLTFToPNGBufferFromURL"
import { renderDrawCalls } from "./renderDrawCalls"

function browserPathUsageError(): never {
  throw new Error(
    "renderGLTFToPNGBuffer could not parse the input as GLTF JSON. In browsers, pass a GLTF JSON string/object or a fetchable URL. Node filesystem paths remain supported when running under Node.",
  )
}

function isNodeRuntime(): boolean {
  const runtimeProcess = (globalThis as {
    process?: { versions?: { node?: string } }
  }).process
  return !!runtimeProcess?.versions?.node
}

function isExplicitNetworkURL(source: string): boolean {
  return (
    /^(https?:)?\/\//i.test(source) ||
    source.startsWith("data:") ||
    source.startsWith("blob:")
  )
}

function isBrowserFetchableURL(source: string): boolean {
  return source.trim().length > 0
}

async function loadNodeFilesystemGLTF(
  gltfPath: string,
): Promise<{ gltf: any; resources: GLTFResources }> {
  const dynamicImport = new Function(
    "specifier",
    "return import(specifier)",
  ) as (specifier: string) => Promise<any>

  const fs = await dynamicImport("node:fs/promises")
  const path = await dynamicImport("node:path")
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

function renderFromGLTF(
  gltf: Record<string, unknown>,
  options: RenderOptionsInput,
  resources: GLTFResources,
): Promise<Buffer> {
  const scene = createSceneFromGLTF(gltf, resources)
  const { bitmap } = renderDrawCalls(scene.drawCalls, options, pureImageFactory)
  return encodePNGToBuffer(bitmap)
}

export async function renderGLTFToPNGBuffer(
  gltfOrJson: string | Record<string, unknown>,
  options: RenderOptionsInput = {},
  resources: GLTFResources = { buffers: [], images: [] },
): Promise<Buffer> {
  if (typeof gltfOrJson !== "string") {
    return renderFromGLTF(gltfOrJson, options, resources)
  }

  try {
    return await renderFromGLTF(JSON.parse(gltfOrJson), options, resources)
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
  }

  if (isNodeRuntime()) {
    if (isExplicitNetworkURL(gltfOrJson)) {
      return await renderGLTFToPNGBufferFromURL(gltfOrJson, options)
    }

    const loaded = await loadNodeFilesystemGLTF(gltfOrJson)
    return await renderFromGLTF(loaded.gltf, options, loaded.resources)
  }

  if (isBrowserFetchableURL(gltfOrJson)) {
    return await renderGLTFToPNGBufferFromURL(gltfOrJson, options)
  }

  return browserPathUsageError()
}
