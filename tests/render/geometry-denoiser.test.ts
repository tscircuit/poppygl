import { expect, test } from "bun:test"
import { GeometryDenoiser } from "../../lib/render/GeometryDenoiser"

test("denoiser keeps radiance of pixels whose guide normal is degenerate", () => {
  const width = 4
  const height = 4
  const denoiser = new GeometryDenoiser(width, height)
  const material = {
    baseColorFactor: [1, 1, 1, 1] as [number, number, number, number],
    baseColorTexture: null,
  }
  const materialId = denoiser.materialId(material)

  const healthyIndex = 1 * width + 1
  denoiser.record(
    healthyIndex,
    materialId,
    [0, 0, 1],
    [0.5, 0.5, 0.5],
    [0.5, 0.2, 0.1],
    2,
  )
  // A degenerate guide normal (interpolated opposing vertex normals, or a
  // degenerate face) must not zero out the pixel's recorded radiance.
  const degenerateIndex = 1 * width + 2
  denoiser.record(
    degenerateIndex,
    materialId,
    [0, 0, 0],
    [0.5, 0.5, 0.5],
    [0.8, 0.8, 0.8],
    2,
  )

  const output = new Uint8ClampedArray(width * height * 4).fill(255)
  denoiser.apply(output, false)

  const healthy = [
    output[healthyIndex * 4],
    output[healthyIndex * 4 + 1],
    output[healthyIndex * 4 + 2],
  ]
  expect(healthy).toEqual([127, 51, 25])

  const degenerate = [
    output[degenerateIndex * 4],
    output[degenerateIndex * 4 + 1],
    output[degenerateIndex * 4 + 2],
  ]
  expect(degenerate.every((channel) => Number.isFinite(channel))).toBe(true)
  // 0.8 * 255 = 204
  expect(degenerate).toEqual([204, 204, 204])
})
