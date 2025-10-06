import { test, expect } from "bun:test"
import { renderGLTFToPNGBuffer } from "../../cli/renderGLTFToPNGBuffer"
import "../fixtures/preload"

test("grid01", async () => {
  // We render an empty gltf scene, but with a grid enabled.
  const emptyGLTF = JSON.stringify({
    asset: { version: "2.0" },
    scenes: [{ nodes: [] }],
    scene: 0,
  })

  const pngBuffer = await renderGLTFToPNGBuffer(emptyGLTF, {
    width: 320,
    height: 240,
    grid: { size: 8 },
    camPos: [8, 6, 8],
    lookAt: [0, 0, 0],
  })
  await expect(pngBuffer).toMatchPngSnapshot(import.meta.path)
})
