import { createSceneFromGLTF, renderSceneFromGLTF } from "../lib/index"
import { encodePNGToBuffer } from "../lib/image/encodePNGToBuffer"
import { pureImageFactory } from "../lib/image/pureImageFactory"
import type { RenderOptionsInput } from "../lib/render/getDefaultRenderOptions"
import { loadGLTFWithResources } from "./loadGLTFWithResources"

export async function renderGLTFToPNGBuffer(
  gltfPathOrString: string,
  options: RenderOptionsInput = {},
): Promise<Buffer> {
  let gltf: any
  let resources: any

  try {
    gltf = JSON.parse(gltfPathOrString)
    resources = { buffers: [], images: [] }
  } catch {
    const result = await loadGLTFWithResources(gltfPathOrString)
    gltf = result.gltf
    resources = result.resources
  }

  const scene = createSceneFromGLTF(gltf, resources)
  const { bitmap } = renderSceneFromGLTF(scene, options, pureImageFactory)
  return encodePNGToBuffer(bitmap)
}
