import { expect, test } from "bun:test"
import "../fixtures/preload"
import { CAD_VIEWER_LIGHTS } from "../../lib/index"
import { makeQuad, renderSceneToPng } from "./visual-helpers"

test("CAD viewer light rig lights a scene", async () => {
  const a = makeQuad(-1, {
    baseColorFactor: [0.2, 0.6, 0.3, 1],
    baseColorTexture: null,
    metallicFactor: 0.2,
    roughnessFactor: 0.5,
  })
  const b = makeQuad(1, {
    baseColorFactor: [0.8, 0.4, 0.2, 1],
    baseColorTexture: null,
    metallicFactor: 0,
    roughnessFactor: 0.8,
  })

  const png = await renderSceneToPng([a, b], {
    ...CAD_VIEWER_LIGHTS,
    exposure: 1,
  })

  await expect(png).toMatchPngSnapshot(import.meta.path)
})
