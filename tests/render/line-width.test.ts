import { expect, test } from "bun:test"
import { mat4 } from "gl-matrix"
import {
  encodePNG,
  renderDrawCalls,
  SoftwareRenderer,
  type DrawCall,
  type LineRenderOptions,
} from "../../lib"
import "../fixtures/preload"

const SIZE = 129
const camera = { view: mat4.create(), proj: mat4.create() }

function line(positions: number[], alpha = 1): DrawCall {
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array([0, 1]),
    normals: null,
    uvs: null,
    model: mat4.create(),
    material: {
      baseColorFactor: [0, 0, 0, alpha],
      baseColorTexture: null,
      alphaMode: "BLEND",
    },
    mode: 1,
  }
}

function screenLine(x0: number, y0: number, x1: number, y1: number) {
  return line([x0 / 64 - 1, 1 - y0 / 64, 0, x1 / 64 - 1, 1 - y1 / 64, 0])
}

function render(
  geometry: DrawCall,
  options: LineRenderOptions = {},
  lineCamera = camera,
) {
  const renderer = new SoftwareRenderer(SIZE, SIZE)
  renderer.clear([0, 0, 0, 0])
  renderer.drawLines(geometry, lineCamera, false, options)
  return renderer
}

function alphaMass(data: Uint8Array | Uint8ClampedArray) {
  let total = 0
  for (let i = 3; i < data.length; i += 4) total += data[i]! / 255
  return total
}

function alphaAt(renderer: SoftwareRenderer, x: number, y: number) {
  return renderer.buffer[(y * SIZE + x) * 4 + 3]!
}

test("line width measures the same perpendicular thickness at every angle", async () => {
  const horizontal = render(screenLine(24, 64, 104, 64), { width: 6 })
  const vertical = render(screenLine(64, 24, 64, 104), { width: 6 })
  const diagonal = render(screenLine(24, 24, 104, 104), { width: 6 })

  const section = (image: SoftwareRenderer, verticalSection = true) =>
    Array.from({ length: SIZE }, (_, i) =>
      alphaAt(image, verticalSection ? 64 : i, verticalSection ? i : 64),
    ).filter((alpha) => alpha > 127).length
  const widths = [
    section(horizontal),
    section(vertical, false),
    section(diagonal) / Math.SQRT2,
  ]
  for (const width of widths) {
    expect(width).toBeGreaterThanOrEqual(5)
    expect(width).toBeLessThanOrEqual(7)
  }

  // One image puts all three orientations together for visual review.
  const comparison = new SoftwareRenderer(SIZE, SIZE)
  comparison.clear([255, 255, 255, 255])
  for (const geometry of [
    screenLine(18, 25, 110, 25),
    screenLine(25, 45, 25, 110),
    screenLine(48, 48, 110, 110),
  ]) {
    comparison.drawLines(geometry, camera, false, { width: 6 })
  }
  await expect(encodePNG(comparison.bitmap)).toMatchPngSnapshot(
    import.meta.path,
    "line-width-orientations",
  )
})

test("translucent thick lines blend each covered pixel once", () => {
  const image = render(screenLine(24, 64, 104, 64), {
    width: 7,
    opacity: 0.5,
  })
  expect(alphaAt(image, 64, 64)).toBe(128)
  expect(alphaAt(image, 64, 62)).toBe(128)
  expect(alphaAt(image, 64, 56)).toBe(0)
})

test("hidden thick lines respect occlusion and preserve the geometry depth", () => {
  const renderer = new SoftwareRenderer(SIZE, SIZE)
  renderer.clear([0, 0, 0, 0])
  // The left half is covered by a nearer object; the right half is empty.
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < 64; x++) renderer.depth[y * SIZE + x] = 0.25
  }
  const originalDepth = renderer.depth.slice()
  renderer.drawLines(screenLine(24, 64, 104, 64), camera, false, {
    width: 7,
    depthCompare: "greater",
    depthWrite: false,
    opacity: 0.35,
  })
  expect(alphaAt(renderer, 40, 64)).toBe(89)
  expect(alphaAt(renderer, 90, 64)).toBe(0)
  expect(renderer.depth).toEqual(originalDepth)
})

test("thick dashed lines leave real gaps across the full stroke", () => {
  const image = render(screenLine(24, 64, 104, 64), {
    width: 7,
    dashed: true,
    dashLength: 8,
  })
  expect(alphaAt(image, 27, 64)).toBe(255)
  expect(alphaAt(image, 35, 64)).toBe(0)
  expect(alphaAt(image, 35, 62)).toBe(0)
  expect(alphaAt(image, 43, 64)).toBe(255)
})

test("lineWidth keeps output-pixel thickness with supersampling", () => {
  const geometry = line([-1, 0, 0, 1, 0, 0])
  const options = {
    width: 128,
    height: 128,
    camPos: [0, 0, 3] as const,
    lookAt: [0, 0, 0] as const,
    lineWidth: 6,
  }
  const base = renderDrawCalls([geometry], options).bitmap
  const supersampled = renderDrawCalls([geometry], {
    ...options,
    supersampling: 3,
  }).bitmap
  const ratio = alphaMass(supersampled.data) / alphaMass(base.data)
  expect(ratio).toBeGreaterThan(0.85)
  expect(ratio).toBeLessThan(1.15)
})

const perspective = {
  view: mat4.create(),
  proj: mat4.perspective(mat4.create(), Math.PI / 2, 1, 1, 20),
}

for (const crossing of [
  { name: "behind the eye", originalEnd: [1.6, 0, 2], nearEnd: [-0.2, 0, -1] },
  { name: "on the eye plane", originalEnd: [0.8, 0, 0], nearEnd: [0, 0, -1] },
]) {
  test(`thick lines crossing ${crossing.name} match a manually clipped segment`, () => {
    const actual = render(
      line([-0.8, 0, -2, ...crossing.originalEnd]),
      { width: 6 },
      perspective,
    )
    const expected = render(
      line([-0.8, 0, -2, ...crossing.nearEnd]),
      { width: 6 },
      perspective,
    )
    expect(alphaMass(expected.buffer)).toBeGreaterThan(30)
    expect(
      Math.abs(alphaMass(actual.buffer) - alphaMass(expected.buffer)),
    ).toBeLessThan(3)
    let changedPixels = 0
    for (let i = 3; i < actual.buffer.length; i += 4) {
      if (actual.buffer[i] !== expected.buffer[i]) changedPixels++
    }
    expect(changedPixels).toBeLessThan(12)
  })
}

test(
  "extreme offscreen endpoints are bounded to the viewport",
  () => {
    const image = render(line([-1e8, 0, 0, 1e8, 0, 0]), { width: 6 })
    expect(alphaAt(image, 0, 64)).toBe(255)
    expect(alphaAt(image, 64, 64)).toBe(255)
    expect(alphaAt(image, 128, 64)).toBe(255)
    expect(alphaMass(image.buffer)).toBeGreaterThan(600)
    expect(alphaMass(image.buffer)).toBeLessThan(1_000)
  },
  { timeout: 1_000 },
)
