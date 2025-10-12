import { test, expect } from "bun:test"
import { fileURLToPath } from "node:url"
import { renderGLTFToPNGBuffer } from "../../cli/renderGLTFToPNGBuffer.ts"
import "../fixtures/preload.ts"

test("infinite-grid02-with-model", async () => {
  // Render a circuit with infinite grid to match 3d-viewer reference appearance
  const gltfPath = fileURLToPath(new URL("./circuit.gltf", import.meta.url))
  const pngBuffer = await renderGLTFToPNGBuffer(gltfPath, {
    width: 800,
    height: 600,
    grid: {
      infiniteGrid: true,
      cellSize: 2,
      offset: { y: 0.2 },
      sectionSize: 20,
      fadeDistance: 100,
      fadeStrength: 1.5,
      gridColor: [0.5, 0.5, 0.5], // Darker gray for visibility on white
      sectionColor: [0.3, 0.3, 0.8], // Darker blue for section lines
    },
    backgroundColor: [1, 1, 1], // White background to match 3d-viewer
    camPos: [30, 20, 30],
    lookAt: [0, 0, 0],
  })
  await expect(pngBuffer).toMatchPngSnapshot(import.meta.path)
})
