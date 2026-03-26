import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { renderGLTFToPNGBufferFromGLBBuffer } from "../../lib/render/renderGLTFToPNGBufferFromGLBBuffer.ts"
import "../fixtures/preload.ts"

test(
  "arduino uno top down snapshot",
  async () => {
    const glbPath = fileURLToPath(
      new URL("../fixtures/assets/arduino-uno.glb", import.meta.url),
    )
    const glb = await readFile(glbPath)
    const pngBuffer = await renderGLTFToPNGBufferFromGLBBuffer(glb, {
      width: 960,
      height: 720,
      supersampling: 2,
      fov: 30,
      camPos: [2.975, 120, 0],
      lookAt: [2.975, 4.62, 0],
      up: "z-",
      cameraRotation: { x: 0, y: 0, z: 90 },
      backgroundColor: [1, 1, 1],
    })

    await expect(pngBuffer).toMatchPngSnapshot(import.meta.path)
  },
  { timeout: 180_000 },
)
