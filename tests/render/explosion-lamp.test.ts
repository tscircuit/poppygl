import { expect, test } from "bun:test"
import { encodePNG, renderDrawCalls, type ExplosionLine } from "../../lib"
import { sideBySide } from "../../scripts/nema17-comparison"
import {
  createLampDrawCalls,
  lampRenderOptions,
} from "../fixtures/reference-lamp"
import "../fixtures/preload"

/** Corresponding points on the shade's lower rim, +60 mm in scene Y. */
const explosionLines: ExplosionLine[] = [-1, 1].map((side) => ({
  points: [
    [side * 36, 68, 0],
    [side * 36, 128, 0],
  ],
  color: [0.015, 0.04, 0.08],
  dashed: true,
}))

test("lamp shade lifts 60 mm with dashed guides between corresponding rim points", async () => {
  const assembledParts = createLampDrawCalls()
  const explodedParts = createLampDrawCalls(60)
  for (let i = 0; i < 3; i++) {
    expect(explodedParts[i]!.model).toEqual(assembledParts[i]!.model)
  }
  expect(assembledParts[3]!.model[13]).toBe(92)
  expect(explodedParts[3]!.model[13]).toBe(152)
  expect(explodedParts[3]!.positions).toEqual(assembledParts[3]!.positions)

  const assembled = renderDrawCalls(assembledParts, lampRenderOptions)
  const explodedWithoutGuides = renderDrawCalls(
    explodedParts,
    lampRenderOptions,
  )
  const exploded = renderDrawCalls(explodedParts, {
    ...lampRenderOptions,
    explosionLines,
  })
  expect(exploded.bitmap.data).not.toEqual(explodedWithoutGuides.bitmap.data)
  await expect(
    sideBySide(
      await encodePNG(assembled.bitmap),
      await encodePNG(exploded.bitmap),
      ["Assembled lamp", "Shade lifted 60 mm + guides"],
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
