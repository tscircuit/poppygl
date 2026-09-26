import { expect, test } from "bun:test"
import {
  GLTF_TRIANGLE_FAN,
  GLTF_TRIANGLE_STRIP,
  GLTF_TRIANGLES,
  triangleListIndices,
} from "../../lib/gltf/expandTriangleIndices"

test("leaves TRIANGLES indices unchanged", () => {
  const indices = new Uint32Array([0, 1, 2, 2, 1, 3])
  expect(triangleListIndices(GLTF_TRIANGLES, indices, 4)).toBe(indices)
  expect(triangleListIndices(undefined, null, 6)).toBeNull()
})

test("expands TRIANGLE_STRIP with glTF odd-triangle winding", () => {
  expect(
    Array.from(
      triangleListIndices(
        GLTF_TRIANGLE_STRIP,
        new Uint32Array([0, 1, 2, 3]),
        4,
      )!,
    ),
  ).toEqual([0, 1, 2, 2, 1, 3])
})

test("expands TRIANGLE_FAN from the first vertex", () => {
  expect(
    Array.from(
      triangleListIndices(GLTF_TRIANGLE_FAN, new Uint32Array([0, 1, 2, 3]), 4)!,
    ),
  ).toEqual([0, 1, 2, 0, 2, 3])
})

test("skips non-triangle primitive modes", () => {
  expect(triangleListIndices(1, new Uint32Array([0, 1]), 2)).toBeUndefined()
  expect(triangleListIndices(0, null, 3)).toBeUndefined()
})
