import { createSceneFromGLTF } from "../gltf/createSceneFromGLTF"
import { loadGLTFWithResourcesFromPath } from "../gltf/loadGLTFWithResourcesFromPath"
import { loadGLTFWithResourcesFromURL } from "../gltf/loadGLTFWithResourcesFromURL"
import type { GLTFResources } from "../gltf/types"
import { encodePNGToBuffer } from "../image/encodePNGToBuffer"
import { pureImageFactory } from "../image/pureImageFactory"
import type { RenderOptionsInput } from "./getDefaultRenderOptions"
import { renderDrawCalls } from "./renderDrawCalls"

function isNodeRuntime(): boolean {
  const runtimeProcess = (
    globalThis as {
      process?: { versions?: { node?: string } }
    }
  ).process
  return !!runtimeProcess?.versions?.node
}

function shouldLoadFromURLInNode(source: string): boolean {
  return (
    /^(https?:)?\/\//i.test(source) ||
    source.startsWith("data:") ||
    source.startsWith("blob:")
  )
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

async function resolveGLTFInput(
  source: string,
): Promise<{ gltf: any; resources: GLTFResources }> {
  try {
    return {
      gltf: JSON.parse(source),
      resources: { buffers: [], images: [] },
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
  }

  if (!isNodeRuntime() || shouldLoadFromURLInNode(source)) {
    const { gltf, resources } = await loadGLTFWithResourcesFromURL(source)
    return { gltf, resources }
  }

  return loadGLTFWithResourcesFromPath(source)
}

export async function renderGLTFToPNGBuffer(
  gltfOrJson: string | any,
  options: RenderOptionsInput = {},
  resources: GLTFResources = { buffers: [], images: [] },
): Promise<Buffer> {
  if (typeof gltfOrJson !== "string") {
    return renderFromGLTF(gltfOrJson, options, resources)
  }

  const loaded = await resolveGLTFInput(gltfOrJson)
  return renderFromGLTF(loaded.gltf, options, loaded.resources)
}
