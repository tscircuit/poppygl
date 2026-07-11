import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"
import { renderGLTFToPNGBuffer } from "../../cli/renderGLTFToPNGBuffer"
import "../fixtures/preload.ts"

test("lib renderGLTFToPNGBuffer renders filesystem paths", async () => {
  const gltfPath = fileURLToPath(new URL("./circuit.gltf", import.meta.url))
  const pngBuffer = await renderGLTFToPNGBuffer(gltfPath, {
    width: 1280,
    height: 960,
  })

  await expect(pngBuffer).toMatchPngSnapshot(import.meta.path)
})
