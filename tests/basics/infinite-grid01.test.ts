import { test, expect } from "bun:test"
import { renderGLTFToPNGBuffer } from "../../cli/renderGLTFToPNGBuffer"
import "../fixtures/preload"

test("infinite-grid01", async () => {
  // We render an empty gltf scene with an infinite grid that fades out
  const emptyGLTF = JSON.stringify({
    asset: { version: "2.0" },
    scenes: [{ nodes: [] }],
    scene: 0,
  })

  const pngBuffer = await renderGLTFToPNGBuffer(emptyGLTF, {
    width: 320,
    height: 240,
    grid: {
      size: 20,
      divisions: 20,
      infinite: true,
      fadeDistance: 15,
    },
    camPos: [12, 9, 12],
    lookAt: [0, 0, 0],
  })
  await expect(pngBuffer).toMatchPngSnapshot(import.meta.path)
})
