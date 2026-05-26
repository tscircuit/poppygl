import { createSceneFromGLTF } from "../gltf/createSceneFromGLTF"
import { loadGLTFWithResourcesFromPath } from "../gltf/loadGLTFWithResourcesFromPath"
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
  const runtimeProcess = (
    globalThis as {
      process?: { versions?: { node?: string } }
    }
  ).process
  return !!runtimeProcess?.versions?.node
}

function shouldFetchInNode(source: string): boolean {
  return (
    /^(https?:)?\/\//i.test(source) ||
    source.startsWith("data:") ||
    source.startsWith("blob:")
  )
}

function shouldFetchInBrowser(source: string): boolean {
  return source.trim().length > 0
}

function renderFromGLTF(
  gltf: any,
  options: RenderOptionsInput,
  resources: GLTFResources,
): Promise<Buffer> {
  const scene = createSceneFromGLTF(gltf, resources)
  const { bitmap } = renderDrawCalls(scene.drawCalls, options, pureImageFactory)
  return encodePNGToBuffer(bitmap)
}

export async function renderGLTFToPNGBuffer(
  gltfOrJson: string | any,
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
    if (shouldFetchInNode(gltfOrJson)) {
      return await renderGLTFToPNGBufferFromURL(gltfOrJson, options)
    }

    const loaded = await loadGLTFWithResourcesFromPath(gltfOrJson)
    return await renderFromGLTF(loaded.gltf, options, loaded.resources)
  }

  if (shouldFetchInBrowser(gltfOrJson)) {
    return await renderGLTFToPNGBufferFromURL(gltfOrJson, options)
  }

  return browserPathUsageError()
}
