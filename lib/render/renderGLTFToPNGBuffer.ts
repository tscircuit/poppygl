import { createSceneFromGLTF } from "../gltf/createSceneFromGLTF"
import { resolveGLTFInput } from "../gltf/resolveGLTFInput"
import type { GLTFResources } from "../gltf/types"
import { encodePNGToBuffer } from "../image/encodePNGToBuffer"
import { pureImageFactory } from "../image/pureImageFactory"
import type { RenderOptionsInput } from "./getDefaultRenderOptions"
import { renderDrawCalls } from "./renderDrawCalls"

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

  const loaded = await resolveGLTFInput(gltfOrJson)
  return renderFromGLTF(loaded.gltf, options, loaded.resources)
}
