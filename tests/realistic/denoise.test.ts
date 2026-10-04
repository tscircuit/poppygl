import { expect, test } from "bun:test"
import { GeometryDenoiser } from "../../lib/render/GeometryDenoiser"
import { encodePNG, type Material } from "../../lib"
import "../fixtures/preload"

test("denoising reduces noise without bleeding across a base-color boundary", async () => {
  const width = 16,
    height = 8,
    filter = new GeometryDenoiser(width, height)
  const material: Material = {
    baseColorFactor: [1, 1, 1, 1],
    baseColorTexture: null,
  }
  const id = filter.materialId(material)
  const output = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const base: [number, number, number] =
        x < 8 ? [0.5, 0.1, 0.1] : [0.1, 0.1, 0.5]
      const noisy: [number, number, number] =
        x === 3 && y === 4 ? [1, 0.2, 0.2] : base
      filter.record(y * width + x, id, [0, 0, 1], base, noisy, 10)
      output[(y * width + x) * 4 + 3] = 255
    }
  filter.apply(output, false)
  expect(output[(4 * width + 3) * 4]).toBeLessThan(180)
  expect(output[(4 * width + 7) * 4]).toBe(127)
  expect(output[(4 * width + 8) * 4 + 2]).toBe(127)
  expect(output[(4 * width + 8) * 4]).toBe(25)
  await expect(
    await encodePNG({ width, height, data: output }),
  ).toMatchPngSnapshot(import.meta.path)
})
