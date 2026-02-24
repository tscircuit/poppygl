import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"
import { renderGLTFToPNGBuffer } from "../../cli/renderGLTFToPNGBuffer"
import "../fixtures/preload"

test("supersampling snapshot", async () => {
  const gltfPath = fileURLToPath(new URL("./circuit.gltf", import.meta.url))
  const pngBuffer = await renderGLTFToPNGBuffer(gltfPath, {
    width: 640,
    height: 480,
    supersampling: 2,
    camPos: [20, 20, 20],
    lookAt: [0, 0, 0],
    grid: { size: 10 },
  })

  await expect(pngBuffer).toMatchPngSnapshot(import.meta.path)
})
