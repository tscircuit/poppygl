import { test, expect } from "bun:test"
import { fileURLToPath } from "node:url"
import { renderGLTFToPNGBuffer } from "../../cli/renderGLTFToPNGBuffer.ts"
import "../fixtures/preload.ts"

test("infinite-grid-soic8", async () => {
  const gltfPath = fileURLToPath(new URL("./soic8.gltf", import.meta.url))
  const pngBuffer = await renderGLTFToPNGBuffer(gltfPath, {
    width: 800,
    height: 600,
    grid: {
      infiniteGrid: true,
      cellSize: 0.5,
      sectionSize: 5,
      fadeDistance: 20,
      fadeStrength: 1.5,
      gridColor: [0.5, 0.5, 0.5],
      sectionColor: [0.3, 0.3, 0.8],
    },
    backgroundColor: [1, 1, 1],
    camPos: [10, 5, 10],
    lookAt: [0, 0, 0],
  })
  await expect(pngBuffer).toMatchPngSnapshot(import.meta.path)
})
