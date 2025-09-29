import { createSceneFromGLTF } from "../gltf/createSceneFromGLTF"
import {
  loadGLTFWithResourcesFromURL,
  type LoadGLTFWithResourcesFromURLOptions,
} from "../gltf/loadGLTFWithResourcesFromURL"
import { renderDrawCalls } from "./renderDrawCalls"
import type { RenderOptionsInput } from "./getDefaultRenderOptions"
import { pureImageFactory } from "../image/pureImageFactory"
import { encodePNGToBuffer } from "../image/encodePNGToBuffer"

export interface RenderGLTFToPNGBufferFromURLOptions
  extends RenderOptionsInput,
    LoadGLTFWithResourcesFromURLOptions {}

export async function renderGLTFToPNGBufferFromURL(
  url: string,
  options: RenderGLTFToPNGBufferFromURLOptions = {},
): Promise<Buffer> {
  const { fetchImpl, ...renderOptions } = options
  const { gltf, resources } = await loadGLTFWithResourcesFromURL(url, {
    fetchImpl,
  })
  const scene = createSceneFromGLTF(gltf, resources)
  const { bitmap } = renderDrawCalls(
    scene.drawCalls,
    renderOptions,
    pureImageFactory,
  )
  return encodePNGToBuffer(bitmap)
}
