import { beforeAll, expect, test } from "bun:test"
import { encodePNG, SoftwareRenderer } from "../../lib"
import {
  loadClassicF1,
  outlineComparison,
  renderClassicF1,
} from "../fixtures/classic-f1-outline"
import "../fixtures/preload"

let interpolations = 0

beforeAll(async () => {
  const scene = await loadClassicF1()
  expect(scene.drawCalls.length).toBeGreaterThan(50)
  const originalInterpolate = SoftwareRenderer.prototype.perspInterp
  SoftwareRenderer.prototype.perspInterp = function (...args) {
    interpolations++
    return originalInterpolate.apply(this, args)
  }
  let bitmaps: ReturnType<typeof renderClassicF1>
  try {
    bitmaps = renderClassicF1(scene)
  } finally {
    SoftwareRenderer.prototype.perspInterp = originalInterpolate
  }
  // Enforce the actual render and counter separately from the expected failure.
  await expect(
    encodePNG(outlineComparison({ bitmaps, interpolations })),
  ).toMatchPngSnapshot(import.meta.path)
}, 120_000)

test.failing(
  "Classic F1's constant white outline surfaces skip shader interpolation",
  () => {
    expect(interpolations).toBe(0)
  },
)
