import { expect, test } from "bun:test"
import { mat4 } from "gl-matrix"
import type { DrawCall } from "../../lib/gltf/types"
import { renderDrawCalls } from "../../lib/render/renderDrawCalls"

const countOpaquePixels = (data: Uint8ClampedArray | Uint8Array) => {
  let count = 0
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! > 0) count += 1
  }
  return count
}

test("wireframe render mode draws mesh edges without filling faces", () => {
  const square: DrawCall = {
    positions: new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: null,
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    model: mat4.create(),
    material: {
      baseColorFactor: [1, 0, 0, 1],
      baseColorTexture: null,
    },
  }

  const baseOptions = {
    width: 96,
    height: 96,
    camPos: [0, 0, 4] as const,
    lookAt: [0, 0, 0] as const,
    cull: false,
    gamma: false,
  }

  const solid = renderDrawCalls([square], baseOptions)
  const wireframe = renderDrawCalls([square], {
    ...baseOptions,
    renderMode: "wireframe",
  })

  const solidOpaque = countOpaquePixels(solid.bitmap.data)
  const wireframeOpaque = countOpaquePixels(wireframe.bitmap.data)

  expect(wireframeOpaque).toBeGreaterThan(0)
  expect(solidOpaque).toBeGreaterThan(wireframeOpaque * 4)
})
