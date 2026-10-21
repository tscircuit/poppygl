import { expect, test } from "bun:test"
import { primitives } from "@jscad/modeling"
import { createEdgeDrawCall, encodePNG, renderDrawCalls } from "../../lib"
import { mesh, options } from "../fixtures/outline"
import "../fixtures/preload"

test("smooth faceted models gain silhouettes without triangle diagonals", async () => {
  const cylinder = mesh(
    primitives.cylinder({ height: 2, radius: 1, segments: 64 }),
  )
  const result = renderDrawCalls([cylinder], { ...options, up: "z+" })
  const creases = createEdgeDrawCall(cylinder)!
  const outlines = createEdgeDrawCall(cylinder, 30, {
    view: result.camera.view,
    projection: "orthographic",
  })!
  expect(outlines.indices!.length).toBeGreaterThan(creases.indices!.length)
  expect(
    outlines.indices!.length - creases.indices!.length,
  ).toBeLessThanOrEqual(8)
  await expect(encodePNG(result.bitmap)).toMatchPngSnapshot(
    import.meta.path,
    "outline-cylinder",
  )
})
