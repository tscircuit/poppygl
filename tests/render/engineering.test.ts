import { expect, test } from "bun:test"
import { mat4, vec3 } from "gl-matrix"
import { geometries, primitives } from "@jscad/modeling"
import {
  createEngineeringSection,
  createEdgeDrawCall,
  createUint8Bitmap,
  encodePNG,
  renderDrawCalls,
  resolveRenderOptions,
  type DrawCall,
} from "../../lib"
import "../fixtures/preload"

function mesh(shape = primitives.cuboid({ size: [2, 2, 2] })): DrawCall {
  const positions: number[] = []
  for (const poly of geometries.geom3.toPolygons(shape))
    for (let i = 1; i + 1 < poly.vertices.length; i++)
      positions.push(
        ...poly.vertices[0]!,
        ...poly.vertices[i]!,
        ...poly.vertices[i + 1]!,
      )
  return {
    positions: new Float32Array(positions),
    indices: null,
    normals: null,
    uvs: null,
    model: mat4.create(),
    material: {
      baseColorFactor: [1, 0, 0, 0.1],
      baseColorTexture: null,
      alphaMode: "BLEND",
    },
    showHiddenEdges: true,
  }
}
const options = {
  renderStyle: "engineering" as const,
  width: 200,
  height: 200,
  camPos: [4, 3, 6] as const,
  lookAt: [0, 0, 0] as const,
  supersampling: 2,
  edgeWidth: 1.5,
}
function ink(data: Uint8Array | Uint8ClampedArray) {
  let sum = 0
  for (let i = 0; i < data.length; i += 4) sum += 255 - data[i]!
  return sum
}
function comparison(images: ReturnType<typeof renderDrawCalls>["bitmap"][]) {
  const result = createUint8Bitmap(200 * images.length, 200)
  for (const [column, image] of images.entries())
    for (let y = 0; y < 200; y++)
      result.data.set(
        image.data.subarray(y * 800, (y + 1) * 800),
        (y * result.width + column * 200) * 4,
      )
  return result
}

test("engineering produces white occluding surfaces and optional dashed hidden edges", async () => {
  const cube = mesh()
  const visible = renderDrawCalls([cube], options)
  const hidden = renderDrawCalls([cube], { ...options, showHiddenEdges: true })
  expect(visible.options.projection).toBe("orthographic")
  expect(visible.options.showHiddenEdges).toBe(false)
  expect(ink(visible.bitmap.data)).toBeGreaterThan(30000)
  expect(ink(hidden.bitmap.data)).toBeGreaterThan(
    ink(visible.bitmap.data) + 1000,
  )
  expect(cube.material.alphaMode).toBe("BLEND")
  const blank = renderDrawCalls([cube], { ...options, showEdges: false }).bitmap
  expect(ink(blank.data)).toBe(0)
  expect(Array.from(blank.data).every((n) => n === 255)).toBe(true)
  await expect(
    encodePNG(comparison([visible.bitmap, hidden.bitmap])),
  ).toMatchPngSnapshot(import.meta.path)
})

test("orthographic projection preserves size across camera distances and fits portrait bounds", () => {
  const cube = mesh()
  const a = renderDrawCalls([cube], {
    ...options,
    camPos: [0, 0, 6],
    orthographicHeight: 4,
  })
  const b = renderDrawCalls([cube], {
    ...options,
    camPos: [0, 0, 60],
    orthographicHeight: 4,
  })
  expect(a.camera.proj[15]).toBe(1)
  const project = (point: number[], result: typeof a) =>
    vec3.transformMat4(
      vec3.create(),
      vec3.transformMat4(vec3.create(), point, result.camera.view),
      result.camera.proj,
    )
  expect(project([1, 1, 0], a)[0]).toBeCloseTo(project([1, 1, 0], b)[0]!, 6)
  expect(project([1, 1, 0], a)[1]).toBeCloseTo(0.5, 6)
  const fit = renderDrawCalls([cube], { ...options, width: 100, height: 300 })
  for (let i = 0; i < cube.positions.length; i += 3) {
    const p = project(Array.from(cube.positions.subarray(i, i + 3)), fit)
    expect(Math.abs(p[0]!)).toBeLessThan(0.92)
    expect(Math.abs(p[1]!)).toBeLessThan(0.92)
  }
  expect(
    resolveRenderOptions({ orthographicHeight: Infinity }).orthographicHeight,
  ).toBeNull()
  expect(resolveRenderOptions({}).projection).toBe("perspective")
})

test("smooth faceted models gain silhouettes without triangle diagonals", async () => {
  const cylinder = mesh(
    primitives.cylinder({ height: 2, radius: 1, segments: 64 }),
  )
  const result = renderDrawCalls([cylinder], { ...options, up: "z+" })
  const creases = createEdgeDrawCall(cylinder)!
  const outlines = createEdgeDrawCall(cylinder, 30, {
    view: result.camera.view,
    projection: "orthographic",
  })!
  expect(outlines.indices!.length).toBeGreaterThan(creases.indices!.length)
  expect(
    outlines.indices!.length - creases.indices!.length,
  ).toBeLessThanOrEqual(8)
  await expect(encodePNG(result.bitmap)).toMatchPngSnapshot(
    import.meta.path,
    "engineering-cylinder",
  )
})

test("section caps are hatched, keep cavities empty, and respect transformed planes", async () => {
  const tube = mesh(
    primitives.cylinderElliptic({
      height: 3,
      startRadius: [1, 1],
      endRadius: [1, 1],
      segments: 32,
    }),
  )
  // Combine independently wound outer and inner shells in one primitive, as in a hollow model.
  const inner = mesh(
    primitives.cylinder({ height: 3, radius: 0.55, segments: 32 }),
  )
  const data = Array.from(tube.positions)
  for (let i = 0; i < inner.positions.length; i += 9)
    data.push(
      ...inner.positions.subarray(i + 6, i + 9),
      ...inner.positions.subarray(i + 3, i + 6),
      ...inner.positions.subarray(i, i + 3),
    )
  tube.positions = new Float32Array(data)
  const section = {
    axis: "z" as const,
    offset: 0,
    keepSide: "less" as const,
    hatchSpacing: 0.2,
  }
  const cut = createEngineeringSection([tube], section)
  expect(cut.openChains).toBe(0)
  const cap = cut.drawCalls.find((dc) => dc.material.baseColorTexture)!
  let area = 0
  for (let i = 0; i < cap.positions.length; i += 9) {
    const p = cap.positions.subarray(i, i + 9)
    area +=
      Math.abs(
        (p[3]! - p[0]!) * (p[7]! - p[1]!) - (p[4]! - p[1]!) * (p[6]! - p[0]!),
      ) / 2
  }
  expect(area).toBeCloseTo(
    ((32 * Math.sin((2 * Math.PI) / 32)) / 2) * (1 - 0.55 ** 2),
    4,
  )
  const image = renderDrawCalls([tube], {
    ...options,
    camPos: [3, 4, 6],
    up: "z+",
    section,
  }).bitmap
  const opposite = renderDrawCalls([tube], {
    ...options,
    camPos: [3, 4, -6],
    up: "z+",
    section: { ...section, keepSide: "greater" },
  }).bitmap
  expect(ink(image.data)).toBeGreaterThan(20000)
  const transformed = mesh()
  mat4.translate(transformed.model, transformed.model, [5, 2, -3])
  mat4.scale(transformed.model, transformed.model, [2, 3, 4])
  const worldCut = createEngineeringSection([transformed], {
    axis: "x",
    offset: 5,
    keepSide: "greater",
  })
  for (const dc of worldCut.drawCalls)
    for (let i = 0; i < dc.positions.length; i += 3)
      expect(dc.positions[i]!).toBeGreaterThanOrEqual(5)
  expect(worldCut.drawCalls.some((dc) => dc.material.baseColorTexture)).toBe(
    true,
  )
  await expect(encodePNG(comparison([image, opposite]))).toMatchPngSnapshot(
    import.meta.path,
    "engineering-section",
  )
})

test("sections outside or tangent to a mesh do not fabricate caps; open surfaces stay open", () => {
  for (const offset of [1, 10, -1, -10]) {
    const cut = createEngineeringSection([mesh()], {
      axis: "x",
      offset,
      keepSide: "less",
    })
    expect(cut.drawCalls.some((dc) => dc.material.baseColorTexture)).toBe(false)
  }
  const open = mesh()
  open.positions = new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0])
  const cut = createEngineeringSection([open], {
    axis: "x",
    offset: 0,
    keepSide: "less",
  })
  expect(cut.openChains).toBe(1)
  expect(cut.drawCalls.length).toBe(1)
  expect(() =>
    createEngineeringSection([mesh()], {
      axis: "x",
      offset: 0,
      keepSide: "less",
      hatchSpacing: 0,
    }),
  ).toThrow()
})
