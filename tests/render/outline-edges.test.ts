import { expect, test } from "bun:test"
import { encodePNG, renderDrawCalls } from "../../lib"
import { mesh, options, ink, comparison } from "../fixtures/outline"
import "../fixtures/preload"

test("outline produces white occluding surfaces and optional dashed hidden edges", async () => {
  const cube = mesh()
  const visible = renderDrawCalls([cube], options)
  const hidden = renderDrawCalls([cube], { ...options, showHiddenEdges: true })
  expect(visible.options.projection).toBe("orthographic")
  expect(visible.options.showHiddenEdges).toBe(false)
  expect(ink(visible.bitmap.data)).toBeGreaterThan(30000)
  expect(ink(hidden.bitmap.data)).toBeGreaterThan(
    ink(visible.bitmap.data) + 1000,
  )
  expect(cube.material.alphaMode).toBe("BLEND")
  const blank = renderDrawCalls([cube], { ...options, showEdges: false }).bitmap
  expect(ink(blank.data)).toBe(0)
  expect(Array.from(blank.data).every((n) => n === 255)).toBe(true)
  await expect(
    encodePNG(comparison([visible.bitmap, hidden.bitmap])),
  ).toMatchPngSnapshot(import.meta.path, "outline")
})
