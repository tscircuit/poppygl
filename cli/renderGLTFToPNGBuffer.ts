import {
  createSceneFromGLTF,
  encodePNGToBuffer,
  pureImageFactory,
  renderSceneFromGLTF,
} from "../lib/index"
import type { RenderOptionsInput } from "../lib/render/getDefaultRenderOptions"
import { loadGLTFWithResources } from "./loadGLTFWithResources"

export async function renderGLTFToPNGBuffer(
  gltfPath: string,
  options: RenderOptionsInput = {},
): Promise<Buffer> {
  const { gltf, resources } = await loadGLTFWithResources(gltfPath)
  const scene = createSceneFromGLTF(gltf, resources)
  const { bitmap } = renderSceneFromGLTF(scene, options, pureImageFactory)
  return encodePNGToBuffer(bitmap)
}
