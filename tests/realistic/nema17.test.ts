import { expect, test } from "bun:test"
import { renderGLTFToPNGFromGLB } from "../../lib"
import {
  imageError,
  nema17Comparison,
  readNema17Fixture,
  resizeReference,
  sideBySide,
} from "../../scripts/nema17-comparison"
import "../fixtures/preload"

test(
  "NEMA17 studio rendering is closer to the committed Cycles reference",
  async () => {
    const { glb, blender, options } = await readNema17Fixture()
    // 300px with 2x supersampling covers material response, geometry, reflections,
    // and soft shadows while keeping CI cheaper than the 900px deliverable.
    const small = { ...options, width: 300, height: 300, supersampling: 2 }
    const realistic = await renderGLTFToPNGFromGLB(glb, {
      ...small,
      realistic: true,
    })
    const legacy = await renderGLTFToPNGFromGLB(glb, {
      ...small,
      realistic: false,
    })
    const reference = resizeReference(blender, 300)
    const realError = imageError(realistic, reference),
      oldError = imageError(legacy, reference)
    console.log("NEMA17 reference error", {
      realistic: realError,
      legacy: oldError,
    })
    // A substantial improvement over the diffuse renderer, plus an absolute
    // bound. Exact Cycles equality is not implied by this image-level gate.
    expect(realError.mae).toBeLessThan(oldError.mae * 0.7)
    expect(realError.mae).toBeLessThan(0.08)
    await expect(sideBySide(realistic, reference)).toMatchPngSnapshot(
      import.meta.path,
    )
    await expect(
      nema17Comparison(legacy, realistic, reference),
    ).toMatchPngSnapshot(import.meta.path, "all-modes")
  },
  { timeout: 300_000 },
)

test("omitting realistic preserves the explicit legacy mode", async () => {
  const { glb, options } = await readNema17Fixture()
  const small = { ...options, width: 100, height: 100, supersampling: 1 }
  const omitted = await renderGLTFToPNGFromGLB(glb, small)
  const explicit = await renderGLTFToPNGFromGLB(glb, {
    ...small,
    realistic: false,
  })
  expect(omitted).toEqual(explicit)
})
