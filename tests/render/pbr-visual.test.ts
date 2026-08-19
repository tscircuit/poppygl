import { expect, test } from "bun:test"
import "../fixtures/preload"
import { makeQuad, renderSceneToPng } from "./visual-helpers"

test("PBR: metallic surface produces strong specular, dielectric stays diffuse", async () => {
  const metal = makeQuad(-1, {
    baseColorFactor: [0.9, 0.9, 0.9, 1],
    baseColorTexture: null,
    metallicFactor: 1,
    roughnessFactor: 0.3,
  })
  const dielectric = makeQuad(1, {
    baseColorFactor: [0.9, 0.9, 0.9, 1],
    baseColorTexture: null,
    metallicFactor: 0,
    roughnessFactor: 0.3,
  })

  const png = await renderSceneToPng([metal, dielectric], {
    ambientColor: [0.15, 0.15, 0.15],
    directionalLights: [{ color: [1, 1, 1], intensity: 0.6, dir: [0, 0, 1] }],
  })

  await expect(png).toMatchPngSnapshot(import.meta.path)
})
