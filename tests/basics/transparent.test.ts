import { test, expect } from "bun:test"
import { fileURLToPath } from "node:url"
import { renderGLTFToPNGBuffer } from "../../cli/renderGLTFToPNGBuffer.ts"
import "../fixtures/preload.ts"

test("transparent materials", async () => {
  const gltfPath = fileURLToPath(
    new URL("./transparent.gltf", import.meta.url),
  )
  const pngBuffer = await renderGLTFToPNGBuffer(gltfPath, {
    width: 640,
    height: 480,
  })
  await expect(pngBuffer).toMatchPngSnapshot(import.meta.path)
})
