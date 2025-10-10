import { test, expect } from "bun:test"
import { renderGLTFToPNGBuffer } from "../../cli/renderGLTFToPNGBuffer"
import "../fixtures/preload"

test("infinite-grid01", async () => {
  // We render an empty gltf scene with infinite grid matching 3d-viewer reference
  const emptyGLTF = JSON.stringify({
    asset: { version: "2.0" },
    scenes: [{ nodes: [] }],
    scene: 0,
  })

  const pngBuffer = await renderGLTFToPNGBuffer(emptyGLTF, {
    width: 800,
    height: 600,
    grid: {
      infiniteGrid: true,
      cellSize: 1,
      sectionSize: 10,
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
