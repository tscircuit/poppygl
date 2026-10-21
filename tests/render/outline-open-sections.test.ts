import { expect, test } from "bun:test"
import { createOutlineSection } from "../../lib"
import { mesh } from "../fixtures/outline"

test("sections outside or tangent to a mesh do not fabricate caps; open surfaces stay open", () => {
  for (const offset of [1, 10, -1, -10]) {
    const cut = createOutlineSection([mesh()], {
      axis: "x",
      offset,
      keepSide: "less",
    })
    expect(cut.drawCalls.some((dc) => dc.material.baseColorTexture)).toBe(false)
  }
  const open = mesh()
  open.positions = new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0])
  const cut = createOutlineSection([open], {
    axis: "x",
    offset: 0,
    keepSide: "less",
  })
  expect(cut.openChains).toBe(1)
  expect(cut.drawCalls.length).toBe(1)
  expect(() =>
    createOutlineSection([mesh()], {
      axis: "x",
      offset: 0,
      keepSide: "less",
      hatchSpacing: 0,
    }),
  ).toThrow()
})
