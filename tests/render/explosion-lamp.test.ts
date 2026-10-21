import { expect, test } from "bun:test"
import { encodePNG, renderDrawCalls, type ExplosionLine } from "../../lib"
import { sideBySide } from "../../scripts/nema17-comparison"
import {
  createLampDrawCalls,
  lampRenderOptions,
} from "../fixtures/reference-lamp"
import "../fixtures/preload"

/** Front rim points keep both arrowheads visible; each lifts +60 mm in scene Y. */
const rimPoints = [
  [-36 / Math.SQRT2, 36 / Math.SQRT2],
  [36, 0],
] as const
const explosionLines: ExplosionLine[] = rimPoints.map(([x, z]) => ({
  points: [
    [x, 68, z],
    [x, 128, z],
  ],
  color: [0.015, 0.04, 0.08],
  dashed: true,
  arrow: true,
}))

test("lamp shade lifts 60 mm with upward arrow guides between corresponding rim points", async () => {
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
  const explodedWithoutArrows = renderDrawCalls(explodedParts, {
    ...lampRenderOptions,
    explosionLines: explosionLines.map((line) => ({ ...line, arrow: false })),
  })
  const exploded = renderDrawCalls(explodedParts, {
    ...lampRenderOptions,
    explosionLines,
  })
  expect(exploded.bitmap.data).not.toEqual(explodedWithoutGuides.bitmap.data)
  expect(exploded.bitmap.data).not.toEqual(explodedWithoutArrows.bitmap.data)
  await expect(
    sideBySide(
      await encodePNG(assembled.bitmap),
      await encodePNG(exploded.bitmap),
      ["Assembled lamp", "Shade lifts 60 mm / arrows on"],
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
