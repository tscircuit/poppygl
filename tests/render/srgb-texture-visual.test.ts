import { expect, test } from "bun:test"
import "../fixtures/preload"
import { CHECKER_TEXTURE, makeQuad, renderSceneToPng } from "./visual-helpers"

const CHECKER_MATERIAL = {
  baseColorFactor: [1, 1, 1, 1] as [number, number, number, number],
  baseColorTexture: CHECKER_TEXTURE,
}

test("sRGB texture decode: physical path decodes textures, legacy path uses raw texels", async () => {
  const quad = makeQuad(0, CHECKER_MATERIAL, { uv: true })

  const decoded = await renderSceneToPng([quad], {
    ambientColor: [0.3, 0.3, 0.3],
    directionalLights: [{ color: [1, 1, 1], intensity: 0.8, dir: [0, 0, 1] }],
  })
  await expect(decoded).toMatchPngSnapshot(import.meta.path, "srgb-decoded")

  const raw = await renderSceneToPng([quad], {
    lightDir: [0, 0, -1],
    ambient: 0.7,
  })
  await expect(raw).toMatchPngSnapshot(import.meta.path, "srgb-raw-legacy")
})
