import { expect, test } from "bun:test"
import { mat4 } from "gl-matrix"
import { SoftwareRenderer } from "../../lib/render/SoftwareRenderer"
import { encodePNG } from "../../lib/image/encodePNG"
import "../fixtures/preload"

function renderTexture(gamma = true, factor = 1) {
  const renderer = new SoftwareRenderer(64, 64)
  const material = {
    baseColorFactor: [factor, factor, factor, 1] as [
      number,
      number,
      number,
      number,
    ],
    baseColorTexture: {
      width: 1,
      height: 1,
      data: new Uint8Array([15, 79, 48, 128]),
    },
    alphaMode: "BLEND" as const,
  }
  renderer.clear([0, 0, 0, 0])
  renderer.drawMesh(
    {
      positions: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      uvs: new Float32Array([0, 0, 0, 0, 0, 0]),
      indices: new Uint32Array([0, 1, 2]),
      model: mat4.create(),
      material,
    },
    { view: mat4.create(), proj: mat4.create() },
    { dir: [0, 0, -1], ambient: 1 },
    material,
    false,
    gamma,
  )
  return renderer
}

test("base-color texture RGB round trips through linear lighting; alpha stays linear", async () => {
  const renderer = renderTexture()
  const pixel = [
    ...renderer.buffer.slice((32 * 64 + 32) * 4, (32 * 64 + 32) * 4 + 4),
  ]
  for (const [i, value] of [15, 79, 48].entries()) {
    expect(Math.abs(pixel[i]! - (value * 128) / 255)).toBeLessThanOrEqual(1)
  }
  expect(pixel[3]).toBe(128)
  await expect(
    await encodePNG({ width: 64, height: 64, data: renderer.buffer }),
  ).toMatchPngSnapshot(import.meta.path)
})

test("disabling output gamma still decodes input textures", () => {
  const renderer = renderTexture(false)
  const green = renderer.buffer[(32 * 64 + 32) * 4 + 1]!
  expect(green).toBeGreaterThanOrEqual(9)
  expect(green).toBeLessThanOrEqual(11)
})

test("material factors multiply texture values in linear space", () => {
  const renderer = renderTexture(true, 0.5)
  const green = renderer.buffer[(32 * 64 + 32) * 4 + 1]!
  expect(green).toBeGreaterThanOrEqual(27)
  expect(green).toBeLessThanOrEqual(28)
})
