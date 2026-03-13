import { expect, test } from "bun:test"
import { renderGLTFToPNGBuffer } from "../../cli/renderGLTFToPNGBuffer"
import "../fixtures/preload"

test("debugPoints overlay draws on top of the PNG", async () => {
  const emptyGLTF = JSON.stringify({
    asset: { version: "2.0" },
    scenes: [{ nodes: [] }],
    scene: 0,
  })

  const debugBuffer = await renderGLTFToPNGBuffer(emptyGLTF, {
    width: 800,
    height: 600,
    grid: {
      infiniteGrid: true,
      cellSize: 1,
      sectionSize: 10,
      fadeDistance: 100,
      fadeStrength: 1.5,
      gridColor: [0.5, 0.5, 0.5],
      sectionColor: [0.3, 0.3, 0.8],
    },
    backgroundColor: [1, 1, 1],
    camPos: [30, 20, 30],
    lookAt: [0, 0, 0],
    supersampling: 2,
    debugPoints: [
      { label: "(0,0)", position: { x: 0, y: 0, z: 0 } },
      { label: "(10,0)", position: { x: 10, y: 0, z: 0 } },
      { label: "(0,10)", position: { x: 0, y: 0, z: 10 } },
      { label: "(-10,-10)", position: { x: -10, y: 0, z: -10 } },
    ],
  })

  await expect(debugBuffer).toMatchPngSnapshot(import.meta.path)
})
