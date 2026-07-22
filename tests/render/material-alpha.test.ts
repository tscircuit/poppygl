import { expect, test } from "bun:test"
import { mat4 } from "gl-matrix"
import type { Material } from "../../lib/gltf/types"
import { SoftwareRenderer } from "../../lib/render/SoftwareRenderer"

function renderTriangleAlpha(material: Material): number {
  const renderer = new SoftwareRenderer(3, 3)
  renderer.clear([0, 0, 0, 0])

  renderer.drawMesh(
    {
      positions: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      uvs: null,
      indices: new Uint32Array([0, 1, 2]),
      model: mat4.create(),
      material,
    },
    { view: mat4.create(), proj: mat4.create() },
    { dir: [0, 0, -1], ambient: 1 },
    material,
    false,
    false,
  )

  const centerPixelAlphaIndex = (1 * renderer.width + 1) * 4 + 3
  return renderer.buffer[centerPixelAlphaIndex]!
}

test("OPAQUE materials ignore base color alpha", () => {
  expect(
    renderTriangleAlpha({
      baseColorFactor: [0.5, 0.5, 0.5, 0.5],
      baseColorTexture: null,
      alphaMode: "OPAQUE",
    }),
  ).toBe(255)
})

test("MASK materials are opaque after passing the cutoff", () => {
  expect(
    renderTriangleAlpha({
      baseColorFactor: [0.5, 0.5, 0.5, 0.75],
      baseColorTexture: null,
      alphaMode: "MASK",
      alphaCutoff: 0.5,
    }),
  ).toBe(255)
})

test("MASK materials discard fragments below the cutoff", () => {
  expect(
    renderTriangleAlpha({
      baseColorFactor: [0.5, 0.5, 0.5, 0.25],
      baseColorTexture: null,
      alphaMode: "MASK",
      alphaCutoff: 0.5,
    }),
  ).toBe(0)
})

test("BLEND materials preserve fractional alpha", () => {
  expect(
    renderTriangleAlpha({
      baseColorFactor: [0.5, 0.5, 0.5, 0.5],
      baseColorTexture: null,
      alphaMode: "BLEND",
    }),
  ).toBe(127)
})
