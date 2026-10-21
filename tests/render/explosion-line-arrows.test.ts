import { expect, test } from "bun:test"
import { mat4, vec4 } from "gl-matrix"
import {
  createUint8Bitmap,
  encodePNG,
  renderDrawCalls,
  type BitmapLike,
  type DrawCall,
  type ExplosionLine,
  type RenderOptionsInput,
} from "../../lib"
import "../fixtures/preload"

type Point = readonly [number, number, number]
const options = {
  width: 220,
  height: 220,
  camPos: [0, 0, 5] as const,
  lookAt: [0, 0, 0] as const,
  backgroundColor: "#ffffff",
  gamma: false,
  ambient: 1,
  lineWidth: 2,
}

function render(
  points: readonly Point[],
  arrow?: boolean,
  extra: RenderOptionsInput = {},
  draws: DrawCall[] = [],
) {
  const guide: ExplosionLine = { points, color: [0, 0, 0], arrow }
  return renderDrawCalls(draws, {
    ...options,
    ...extra,
    explosionLines: [guide],
  })
}

function changedPixels(base: BitmapLike, arrow: BitmapLike) {
  const changed: { x: number; y: number; darkness: number }[] = []
  for (let y = 0; y < base.height; y++) {
    for (let x = 0; x < base.width; x++) {
      const index = (y * base.width + x) * 4
      const darkness = base.data[index]! - arrow.data[index]!
      if (darkness > 2) changed.push({ x, y, darkness })
    }
  }
  return changed
}

function projectedPoint(point: Point, result: ReturnType<typeof render>) {
  const viewProjection = mat4.multiply(
    mat4.create(),
    result.camera.proj,
    result.camera.view,
  )
  const clip = vec4.transformMat4(
    vec4.create(),
    vec4.fromValues(...point, 1),
    viewProjection,
  )
  return [
    ((clip[0] / clip[3]) * 0.5 + 0.5) * (result.bitmap.width - 1),
    (0.5 - (clip[1] / clip[3]) * 0.5) * (result.bitmap.height - 1),
  ] as const
}

test("explosion arrowheads are optional and face the last segment, including repeated endpoints", async () => {
  const fixtures: { points: Point[]; reverseCamera?: boolean }[] = [
    {
      points: [
        [-1, 0, 0],
        [1, 0, 0],
      ],
    },
    {
      points: [
        [1, 0, 0],
        [-1, 0, 0],
      ],
    },
    {
      points: [
        [0, -1, 0],
        [0, 1, 0],
      ],
    },
    {
      points: [
        [0, 1, 0],
        [0, -1, 0],
      ],
    },
    {
      points: [
        [-1, -1, 0],
        [1, -1, 0],
        [1, 1, 0],
        [1, 1, 0],
        [1, 1, 0],
      ],
    },
    {
      points: [
        [-1, -1, 0],
        [1, 1, 0],
      ],
      reverseCamera: true,
    },
  ]
  const comparison = createUint8Bitmap(options.width * 3, options.height * 2)
  for (const [index, fixture] of fixtures.entries()) {
    const extra = fixture.reverseCamera ? { camPos: [0, 0, -5] as const } : {}
    const omitted = render(fixture.points, undefined, extra)
    const disabled = render(fixture.points, false, extra)
    const enabled = render(fixture.points, true, extra)
    expect(disabled.bitmap.data).toEqual(omitted.bitmap.data)

    const changed = changedPixels(disabled.bitmap, enabled.bitmap)
    expect(changed.length).toBeGreaterThan(15)
    const end = fixture.points.at(-1)!
    const previous = fixture.points.findLast((point) =>
      point.some((value, axis) => value !== end[axis]),
    )!
    const tip = projectedPoint(end, enabled)
    const tail = projectedPoint(previous, enabled)
    const length = Math.hypot(tip[0] - tail[0], tip[1] - tail[1])
    const ux = (tip[0] - tail[0]) / length
    const uy = (tip[1] - tail[1]) / length
    let positiveWing = 0
    let negativeWing = 0
    const along: number[] = []
    const across: number[] = []
    for (const pixel of changed) {
      const dx = pixel.x - tip[0]
      const dy = pixel.y - tip[1]
      const progress = dx * ux + dy * uy
      const perpendicular = -dx * uy + dy * ux
      along.push(progress)
      across.push(Math.abs(perpendicular))
      if (perpendicular > 2) positiveWing++
      if (perpendicular < -2) negativeWing++
    }
    expect(Math.min(...along)).toBeGreaterThan(-12)
    expect(Math.max(...along)).toBeLessThan(2)
    expect(Math.max(...across)).toBeLessThan(7)
    expect(positiveWing).toBeGreaterThan(2)
    expect(negativeWing).toBeGreaterThan(2)
    for (let y = 0; y < options.height; y++) {
      comparison.data.set(
        enabled.bitmap.data.subarray(
          y * options.width * 4,
          (y + 1) * options.width * 4,
        ),
        ((Math.floor(index / 3) * options.height + y) * comparison.width +
          (index % 3) * options.width) *
          4,
      )
    }
  }
  await expect(encodePNG(comparison)).toMatchPngSnapshot(import.meta.path)
})

test("an arrow at a visible endpoint follows the clipped segment when its start is behind the camera", () => {
  const points = [
    [1, 0, 6],
    [0, 0, 0],
  ] satisfies Point[]
  const enabled = render(points, true)
  const disabled = render(points, false)
  const changed = changedPixels(disabled.bitmap, enabled.bitmap)
  expect(changed.length).toBeGreaterThan(15)
  const tip = projectedPoint(points[1]!, enabled)
  // The visible shaft enters from the right, so the arrow points left. The
  // un-clipped start has negative W and would give the reversed direction.
  expect(Math.min(...changed.map((point) => point.x))).toBeGreaterThan(
    tip[0] - 2,
  )
  expect(Math.max(...changed.map((point) => point.x))).toBeLessThan(tip[0] + 12)
})

test(
  "clipped and behind-camera authored endpoints do not acquire arrows",
  () => {
    for (const points of [
      [
        [-1, 0, 0],
        [1000, 0, 0],
      ],
      [
        [-1, 0, 0],
        [0, 0, 6],
      ],
      [
        [0, 0, 6],
        [1, 1, 7],
      ],
      [
        [-1, 0, 0],
        [0, 0, 5],
      ],
      [
        [-1, 0, 0],
        [0, 0, 4.999],
      ],
      [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
    ] satisfies Point[][]) {
      expect(render(points, true).bitmap.data).toEqual(
        render(points, false).bitmap.data,
      )
    }
  },
  { timeout: 2_000 },
)

test("an opaque surface occludes the guide's arrowhead", () => {
  const plate: DrawCall = {
    positions: new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: null,
    model: mat4.create(),
    material: { baseColorFactor: [0.3, 0.5, 0.7, 1], baseColorTexture: null },
  }
  const points = [
    [-0.5, 0, -1],
    [0.5, 0, -1],
  ] satisfies Point[]
  const disabled = render(points, false, {}, [plate])
  const enabled = render(points, true, {}, [plate])
  expect(enabled.bitmap.data).toEqual(disabled.bitmap.data)
  expect(
    changedPixels(render(points, false).bitmap, render(points, true).bitmap)
      .length,
  ).toBeGreaterThan(15)
})

test("arrowhead size and stroke thickness stay constant under supersampling", () => {
  const points = [
    [-1, 0, 0],
    [1, 0, 0],
  ] satisfies Point[]
  const ordinary = changedPixels(
    render(points, false).bitmap,
    render(points, true).bitmap,
  )
  const sampled = changedPixels(
    render(points, false, { supersampling: 3 }).bitmap,
    render(points, true, { supersampling: 3 }).bitmap,
  )
  const mass = (pixels: ReturnType<typeof changedPixels>) =>
    pixels.reduce((total, pixel) => total + pixel.darkness, 0)
  const ratio = mass(sampled) / mass(ordinary)
  expect(ratio).toBeGreaterThan(0.8)
  expect(ratio).toBeLessThan(1.2)
  const bounds = (pixels: ReturnType<typeof changedPixels>) => [
    Math.max(...pixels.map((point) => point.x)) -
      Math.min(...pixels.map((point) => point.x)),
    Math.max(...pixels.map((point) => point.y)) -
      Math.min(...pixels.map((point) => point.y)),
  ]
  const baseBounds = bounds(ordinary)
  const sampledBounds = bounds(sampled)
  expect(Math.abs(baseBounds[0]! - sampledBounds[0]!)).toBeLessThanOrEqual(2)
  expect(Math.abs(baseBounds[1]! - sampledBounds[1]!)).toBeLessThanOrEqual(2)
})
