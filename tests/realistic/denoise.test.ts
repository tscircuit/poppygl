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

test("wider separable denoising respects material, normal, depth and silhouettes", async () => {
  const width = 20,
    height = 12
  const filter = new GeometryDenoiser(width, height)
  const material: Material = {
    baseColorFactor: [1, 1, 1, 1],
    baseColorTexture: null,
  }
  const ids = [filter.materialId(material), filter.materialId({ ...material })]
  const colors: [number, number, number][] = [
    [0.8, 0.1, 0.1],
    [0.1, 0.8, 0.1],
    [0.1, 0.1, 0.8],
    [0.8, 0.8, 0.1],
  ]
  const output = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < 16; x++) {
      const zone = Math.floor(x / 4),
        index = y * width + x
      filter.record(
        index,
        ids[zone === 3 ? 1 : 0]!,
        zone === 0 ? [0, 0, 1] : [0, 1, 0],
        [0.5, 0.5, 0.5],
        colors[zone]!,
        zone < 2 ? 10 : 20,
      )
      output[index * 4 + 3] = 255
    }
  filter.apply(output, false)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const index = y * width + x,
        color = colors[Math.floor(x / 4)]
      if (color) {
        for (let c = 0; c < 3; c++)
          expect(
            Math.abs(output[index * 4 + c]! - Math.floor(color[c]! * 255)),
          ).toBeLessThanOrEqual(1)
        expect(output[index * 4 + 3]).toBe(255)
      } else
        expect(Array.from(output.subarray(index * 4, index * 4 + 4))).toEqual([
          0, 0, 0, 0,
        ])
    }
  await expect(encodePNG({ width, height, data: output })).toMatchPngSnapshot(
    import.meta.path,
    "denoise-guides",
  )
})

test("denoising suppresses flat-surface variance while preserving a one-pixel texture line", async () => {
  const width = 32,
    height = 32,
    filter = new GeometryDenoiser(width, height)
  const material: Material = {
    baseColorFactor: [1, 1, 1, 1],
    baseColorTexture: null,
  }
  const id = filter.materialId(material),
    output = new Uint8Array(width * height * 4)
  let before = 0,
    count = 0
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const line = x === y,
        base = line ? 0.9 : 0.4
      const noise = line ? 0 : (((x * 67 + y * 131) % 97) / 96 - 0.5) * 0.3
      filter.record(
        y * width + x,
        id,
        [0, 0, 1],
        [base, base, base],
        [base + noise, base + noise, base + noise],
        10,
      )
      output[(y * width + x) * 4 + 3] = 255
      if (!line && x >= 4 && y >= 4 && x < 28 && y < 28) {
        before += noise * noise
        count++
      }
    }
  filter.apply(output, false)
  let after = 0
  for (let y = 4; y < 28; y++)
    for (let x = 4; x < 28; x++) {
      const value = output[(y * width + x) * 4]! / 255
      if (x === y) expect(value).toBeCloseTo(0.9, 2)
      else after += (value - 0.4) ** 2
    }
  expect(after / count).toBeLessThan((before / count) * 0.15)
  await expect(encodePNG({ width, height, data: output })).toMatchPngSnapshot(
    import.meta.path,
    "denoise-fine-detail",
  )
})
