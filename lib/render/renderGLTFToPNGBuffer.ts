import { createSceneFromGLTF } from "../gltf/createSceneFromGLTF"
import type { LoadGLTFWithResourcesFromURLOptions } from "../gltf/loadGLTFWithResourcesFromURL"
import { resolveGLTFInput } from "../gltf/resolveGLTFInput"
import type { GLTFResources } from "../gltf/types"
import { encodePNGToBuffer } from "../image/encodePNGToBuffer"
import { pureImageFactory } from "../image/pureImageFactory"
import type { RenderOptionsInput } from "./getDefaultRenderOptions"
import { renderDrawCalls } from "./renderDrawCalls"

export interface RenderGLTFToPNGBufferOptions
  extends RenderOptionsInput,
    LoadGLTFWithResourcesFromURLOptions {}

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
  options: RenderGLTFToPNGBufferOptions = {},
  resources: GLTFResources = { buffers: [], images: [] },
): Promise<Buffer> {
  const { fetchImpl, ...renderOptions } = options

  if (typeof gltfOrJson !== "string") {
    return renderFromGLTF(gltfOrJson, renderOptions, resources)
  }

  const loaded = await resolveGLTFInput(gltfOrJson, { fetchImpl })
  return renderFromGLTF(loaded.gltf, renderOptions, loaded.resources)
}
