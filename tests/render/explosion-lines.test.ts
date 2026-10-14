import { expect, test } from "bun:test"
import { mat4 } from "gl-matrix"
import { encodePNG, renderDrawCalls, type DrawCall } from "../../lib"
import "../fixtures/preload"

test("explosion guides follow elbows, respect occlusion, and clip behind the camera", async () => {
  // Renderer-scene XYZ, right-handed +Y up, arbitrary scene units.
  const plate: DrawCall = {
    positions: new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: null,
    model: mat4.create(),
    material: { baseColorFactor: [0.3, 0.5, 0.7, 1], baseColorTexture: null },
  }
  const options = {
    width: 400,
    height: 400,
    camPos: [0, 0, 10] as const,
    lookAt: [0, 0, 0] as const,
    backgroundColor: [1, 1, 1] as const,
    supersampling: 2,
  }
  const baseline = renderDrawCalls([plate], options)
  const rendered = renderDrawCalls([plate], {
    ...options,
    explosionLines: [
      {
        points: [
          [-3, 0, -1],
          [3, 0, -1],
          [3, 3, -1],
        ],
      },
      {
        points: [
          [-3, -2, 1],
          [3, -2, 1],
        ],
        color: [0.5, 0.05, 0.01],
        dashed: false,
      },
      {
        points: [
          [0, 0, 11],
          [4, 4, 12],
        ],
      },
      {
        points: [
          [-1000, -3, 0],
          [1000, -3, 0],
        ],
      },
    ],
  })
  const centerPixel = (200 * 400 + 200) * 4
  expect(rendered.bitmap.data.slice(centerPixel, centerPixel + 4)).toEqual(
    baseline.bitmap.data.slice(centerPixel, centerPixel + 4),
  )
  expect(rendered.bitmap.data).not.toEqual(baseline.bitmap.data)
  await expect(encodePNG(rendered.bitmap)).toMatchPngSnapshot(import.meta.path)
  const omitted = renderDrawCalls([plate], { ...options, explosionLines: [] })
  expect(omitted.bitmap.data).toEqual(baseline.bitmap.data)
  for (const points of [
    [],
    [[0, 0, 0]],
    [
      [0, 0, 0],
      [Number.NaN, 1, 0],
    ],
  ]) {
    expect(() =>
      renderDrawCalls([], {
        explosionLines: [{ points: points as [number, number, number][] }],
      }),
    ).toThrow()
  }
})
