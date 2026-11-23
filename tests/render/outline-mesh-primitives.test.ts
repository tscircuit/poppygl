import { expect, test } from "bun:test"
import {
  createOutlineSection,
  createSceneFromGLTF,
  encodePNG,
  renderDrawCalls,
} from "../../lib"
import { comparison, mesh, options } from "../fixtures/outline"
import "../fixtures/preload"

// A square frame with a square opening and an upturned flange.
const vertices = [
  [-3, 0, -2],
  [3, 0, -2],
  [3, 0, 2],
  [-3, 0, 2],
  [-1, 0, -1],
  [1, 0, -1],
  [1, 0, 1],
  [-1, 0, 1],
  [3, 1, -2],
  [3, 1, 2],
]
const triangles = [
  [0, 1, 5],
  [0, 5, 4],
  [1, 2, 6],
  [1, 6, 5],
  [2, 3, 7],
  [2, 7, 6],
  [3, 0, 4],
  [3, 4, 7],
  [1, 8, 9],
  [1, 9, 2],
]

function loadFrame(layout: "joined" | "split" | "separate_nodes") {
  const groups = layout === "joined" ? [triangles.flat()] : triangles
  const buffers = groups.map(
    (indices) =>
      new Uint8Array(
        new Float32Array(indices.flatMap((i) => vertices[i]!)).buffer,
      ),
  )
  const primitives = groups.map((_, i) => ({
    attributes: { POSITION: i },
    material: i % 2,
  }))
  const meshes =
    layout === "separate_nodes"
      ? primitives.map((p) => ({ primitives: [p] }))
      : [{ primitives }]
  return createSceneFromGLTF(
    {
      asset: { version: "2.0" },
      scenes: [{ nodes: meshes.map((_, i) => i) }],
      nodes: meshes.map((_, mesh) => ({ mesh })),
      meshes,
      materials: [
        { pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } },
        { pbrMetallicRoughness: { baseColorFactor: [0, 0, 1, 1] } },
      ],
      buffers: buffers.map((b) => ({ byteLength: b.byteLength })),
      bufferViews: buffers.map((b, buffer) => ({
        buffer,
        byteLength: b.byteLength,
      })),
      accessors: groups.map((g, bufferView) => ({
        bufferView,
        componentType: 5126,
        count: g.length,
        type: "VEC3",
      })),
    },
    { buffers, images: [] },
  ).drawCalls
}

test("material primitives of one mesh share outline edges", async () => {
  const joined = loadFrame("joined")
  const split = loadFrame("split")
  const separate = loadFrame("separate_nodes")
  const render = (calls: typeof split, showHiddenEdges = false) =>
    renderDrawCalls(calls, { ...options, showHiddenEdges }).bitmap
  const reference = render(joined)
  const actual = render(split)
  expect(Buffer.from(actual.data).equals(Buffer.from(reference.data))).toBe(
    true,
  )
  expect(render(split, true).data).toEqual(render(joined, true).data)
  // Raw draw calls can share one indexed position buffer and copied transforms.
  const indexed = split.map((dc, i) => ({
    ...dc,
    model: new Float32Array(dc.model),
    indices: new Uint32Array(triangles[i]!),
  }))
  const positions = new Float32Array(vertices.flat())
  for (const dc of indexed) dc.positions = positions
  expect(render(indexed).data).toEqual(reference.data)

  // Moving one primitive independently must expose its former shared edge.
  indexed[0]!.model[12] = 5
  const moved = indexed.map((dc, i) =>
    i === 0 ? { ...dc, meshInstance: undefined } : dc,
  )
  expect(render(indexed).data).toEqual(render(moved).data)

  // Splitting a watertight mesh must also preserve its section cap.
  const cube = mesh()
  const instance = {}
  const faces = Array.from({ length: cube.positions.length / 9 }, (_, i) => ({
    ...cube,
    meshInstance: instance,
    positions: cube.positions.subarray(i * 9, i * 9 + 9),
  }))
  const cut = { axis: "x", offset: 0, keepSide: "less" } as const
  const section = createOutlineSection(faces, cut)
  expect(section.openChains).toBe(0)
  expect(section.drawCalls.some((dc) => dc.outlineSectionCap)).toBe(true)
  expect(render(section.drawCalls).data).toEqual(
    render(createOutlineSection([cube], cut).drawCalls).data,
  )

  const separateNodes = render(separate)
  expect(
    Buffer.from(separateNodes.data).equals(Buffer.from(reference.data)),
  ).toBe(false)
  await expect(
    encodePNG(comparison([separateNodes, actual])),
  ).toMatchPngSnapshot(import.meta.path)
})
