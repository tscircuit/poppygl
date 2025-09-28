import { createSceneFromGLTF, renderSceneFromGLTF } from "../lib/index"
import type { RenderOptionsInput } from "../lib/render/getDefaultRenderOptions"
import { encodePNGToBuffer } from "./encodePNGToBuffer"
import { loadGLTFWithResources } from "./loadGLTFWithResources"
import { pureImageFactory } from "./pureImageFactory"

export async function renderGLTFToPNGBuffer(
  gltfPath: string,
  options: RenderOptionsInput = {},
): Promise<Buffer> {
  const { gltf, resources } = await loadGLTFWithResources(gltfPath)
  const scene = createSceneFromGLTF(gltf, resources)
  const { bitmap } = renderSceneFromGLTF(scene, options, pureImageFactory)
  return encodePNGToBuffer(bitmap)
}
