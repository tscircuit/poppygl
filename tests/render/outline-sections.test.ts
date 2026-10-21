import { expect, test } from "bun:test"
import { mat4 } from "gl-matrix"
import { primitives } from "@jscad/modeling"
import { createOutlineSection, encodePNG, renderDrawCalls } from "../../lib"
import { mesh, options, ink, comparison } from "../fixtures/outline"
import "../fixtures/preload"

test("section caps are hatched, keep cavities empty, and respect transformed planes", async () => {
  const tube = mesh(
    primitives.cylinderElliptic({
      height: 3,
      startRadius: [1, 1],
      endRadius: [1, 1],
      segments: 32,
    }),
  )
  // Combine independently wound outer and inner shells in one primitive, as in a hollow model.
  const inner = mesh(
    primitives.cylinder({ height: 3, radius: 0.55, segments: 32 }),
  )
  const data = Array.from(tube.positions)
  for (let i = 0; i < inner.positions.length; i += 9)
    data.push(
      ...inner.positions.subarray(i + 6, i + 9),
      ...inner.positions.subarray(i + 3, i + 6),
      ...inner.positions.subarray(i, i + 3),
    )
  tube.positions = new Float32Array(data)
  const section = {
    axis: "z" as const,
    offset: 0,
    keepSide: "less" as const,
    hatchSpacing: 0.2,
  }
  const cut = createOutlineSection([tube], section)
  expect(cut.openChains).toBe(0)
  const cap = cut.drawCalls.find((dc) => dc.material.baseColorTexture)!
  let area = 0
  for (let i = 0; i < cap.positions.length; i += 9) {
    const p = cap.positions.subarray(i, i + 9)
    area +=
      Math.abs(
        (p[3]! - p[0]!) * (p[7]! - p[1]!) - (p[4]! - p[1]!) * (p[6]! - p[0]!),
      ) / 2
  }
  expect(area).toBeCloseTo(
    ((32 * Math.sin((2 * Math.PI) / 32)) / 2) * (1 - 0.55 ** 2),
    4,
  )
  const image = renderDrawCalls([tube], {
    ...options,
    camPos: [3, 4, 6],
    up: "z+",
    section,
  }).bitmap
  const opposite = renderDrawCalls([tube], {
    ...options,
    camPos: [3, 4, -6],
    up: "z+",
    section: { ...section, keepSide: "greater" },
  }).bitmap
  const prepared = renderDrawCalls(cut.drawCalls, {
    ...options,
    camPos: [3, 4, 6],
    up: "z+",
  }).bitmap
  expect(prepared.data).toEqual(image.data)
  expect(ink(image.data)).toBeGreaterThan(20000)
  const transformed = mesh()
  mat4.translate(transformed.model, transformed.model, [5, 2, -3])
  mat4.scale(transformed.model, transformed.model, [2, 3, 4])
  const worldCut = createOutlineSection([transformed], {
    axis: "x",
    offset: 5,
    keepSide: "greater",
  })
  for (const dc of worldCut.drawCalls)
    for (let i = 0; i < dc.positions.length; i += 3)
      expect(dc.positions[i]!).toBeGreaterThanOrEqual(5)
  expect(worldCut.drawCalls.some((dc) => dc.material.baseColorTexture)).toBe(
    true,
  )
  await expect(encodePNG(comparison([image, opposite]))).toMatchPngSnapshot(
    import.meta.path,
    "outline-section",
  )
})
