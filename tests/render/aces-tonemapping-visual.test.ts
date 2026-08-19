import { expect, test } from "bun:test"
import "../fixtures/preload"
import { makeQuad, renderSceneToPng } from "./visual-helpers"

const BRIGHT_MATERIAL = {
  baseColorFactor: [1, 1, 1, 1] as [number, number, number, number],
  baseColorTexture: null,
  metallicFactor: 0,
  roughnessFactor: 0.5,
}

const STRONG_LIGHT = {
  ambientColor: [0.1, 0.1, 0.1],
  directionalLights: [{ color: [1, 1, 1], intensity: 3, dir: [0, 0, 1] }],
} as const

test("ACES tone mapping rolls off highlights instead of clipping", async () => {
  const quad = makeQuad(0, BRIGHT_MATERIAL)

  const clipped = await renderSceneToPng([quad], STRONG_LIGHT)
  await expect(clipped).toMatchPngSnapshot(import.meta.path, "aces-none")

  const rolled = await renderSceneToPng([quad], {
    ...STRONG_LIGHT,
    toneMapping: "aces",
    exposure: 1,
  })
  await expect(rolled).toMatchPngSnapshot(import.meta.path, "aces-filmic")
})
