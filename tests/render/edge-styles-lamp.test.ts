import { expect, test } from "bun:test"
import { encodePNG, renderDrawCalls } from "../../lib"
import { sideBySide } from "../../scripts/nema17-comparison"
import {
  createLampDrawCalls,
  lampRenderOptions,
} from "../fixtures/reference-lamp"
import "../fixtures/preload"

test("thick hidden edges expose the lamp shade collar and spokes", async () => {
  const lamp = createLampDrawCalls()
  const options = {
    ...lampRenderOptions,
    camPos: [150, 230, 240] as const,
    lookAt: [0, 55, 0] as const,
    fov: 30,
    edgeWidth: 2.5,
    showEdges: true,
  }
  const visible = renderDrawCalls(lamp, options)
  const hidden = renderDrawCalls(lamp, {
    ...options,
    showHiddenEdges: true,
    hiddenEdgeOpacity: 0.45,
  })
  expect(hidden.bitmap.data).not.toEqual(visible.bitmap.data)
  // Overlay options must not mutate the caller's part visibility or geometry.
  expect(lamp.every((part) => part.showHiddenEdges === undefined)).toBe(true)
  await expect(
    sideBySide(
      await encodePNG(visible.bitmap),
      await encodePNG(hidden.bitmap),
      ["Lamp - visible edges 2.5 px", "Lamp - hidden edges 2.5 px"],
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
