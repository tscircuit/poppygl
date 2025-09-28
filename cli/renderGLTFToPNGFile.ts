import * as fs from "node:fs"
import type { RenderOptionsInput } from "../lib/render/getDefaultRenderOptions"
import { renderGLTFToPNGBuffer } from "./renderGLTFToPNGBuffer"

export async function renderGLTFToPNGFile(
  gltfPath: string,
  outputPath: string,
  options: RenderOptionsInput = {},
): Promise<Buffer> {
  const pngBuffer = await renderGLTFToPNGBuffer(gltfPath, options)
  await fs.promises.writeFile(outputPath, pngBuffer)
  return pngBuffer
}
