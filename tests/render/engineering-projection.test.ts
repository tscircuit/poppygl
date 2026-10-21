import { expect, test } from "bun:test"
import { vec3 } from "gl-matrix"
import { renderDrawCalls, resolveRenderOptions } from "../../lib"
import { mesh, options } from "../fixtures/engineering"

test("orthographic projection preserves size across camera distances and fits portrait bounds", () => {
  const cube = mesh()
  const a = renderDrawCalls([cube], {
    ...options,
    camPos: [0, 0, 6],
    orthographicHeight: 4,
  })
  const b = renderDrawCalls([cube], {
    ...options,
    camPos: [0, 0, 60],
    orthographicHeight: 4,
  })
  expect(a.camera.proj[15]).toBe(1)
  const project = (point: number[], result: typeof a) =>
    vec3.transformMat4(
      vec3.create(),
      vec3.transformMat4(vec3.create(), point, result.camera.view),
      result.camera.proj,
    )
  expect(project([1, 1, 0], a)[0]).toBeCloseTo(project([1, 1, 0], b)[0]!, 6)
  expect(project([1, 1, 0], a)[1]).toBeCloseTo(0.5, 6)
  const fit = renderDrawCalls([cube], { ...options, width: 100, height: 300 })
  for (let i = 0; i < cube.positions.length; i += 3) {
    const p = project(Array.from(cube.positions.subarray(i, i + 3)), fit)
    expect(Math.abs(p[0]!)).toBeLessThan(0.92)
    expect(Math.abs(p[1]!)).toBeLessThan(0.92)
  }
  expect(
    resolveRenderOptions({ orthographicHeight: Infinity }).orthographicHeight,
  ).toBeNull()
  expect(resolveRenderOptions({}).projection).toBe("perspective")
})
