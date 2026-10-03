import { expect, test } from "bun:test"
import { mat4 } from "gl-matrix"
import type { DrawCall, Material } from "../../lib/gltf/types"
import { encodePNG } from "../../lib/image/encodePNG"
import { SoftwareRenderer } from "../../lib/render/SoftwareRenderer"
import "../fixtures/preload"
import {
  annotateClipping,
  clippingComparison,
} from "../fixtures/annotate-clipping"

const material: Material = {
  baseColorFactor: [1, 1, 1, 1],
  baseColorTexture: null,
}
const camera = {
  view: mat4.lookAt(mat4.create(), [0, 5, -5], [0, 0, 0], [0, 1, 0]),
  proj: mat4.perspective(mat4.create(), Math.PI / 2, 1, 1, 20),
}

function mesh(positions: number[], indices: number[]): DrawCall {
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    normals: new Float32Array(positions.map((_, i) => (i % 3 === 1 ? 1 : 0))),
    uvs: null,
    model: mat4.create(),
    material,
  }
}

// A green PCB at y=0, plus a blue display beside it at y=0.1.
// The display extends toward and behind the camera, never above the PCB.
// This is the small equivalent of the Muse e-paper thumbnail failure.
function renderPanelScene(preclipped: boolean) {
  const renderer = new SoftwareRenderer(512, 512)
  renderer.clear([237, 242, 248, 255])
  const draw = (geometry: DrawCall, color: Material["baseColorFactor"]) =>
    renderer.drawMesh(
      geometry,
      camera,
      { dir: [0, -1, 0], ambient: 1 },
      { ...material, baseColorFactor: color },
      true,
      false,
    )
  draw(
    mesh(
      [-2.5, 0, -2.5, 2.5, 0, -2.5, 2.5, 0, 2.5, -2.5, 0, 2.5],
      [0, 2, 1, 0, 3, 2],
    ),
    [0.15, 1, 0.3, 1],
  )
  // Camera depth on y=0.1 is (z + 9.9) / sqrt(2); near depth is 1.
  const endZ = preclipped ? Math.SQRT2 - 9.9 : -15
  draw(
    mesh(
      [-8, 0.1, -4, 8, 0.1, -4, 8, 0.1, endZ, -8, 0.1, endZ],
      [0, 2, 1, 0, 3, 2, 0, 1, 2, 0, 2, 3],
    ),
    [0.25, 0.6, 1, 1],
  )
  return renderer
}

test("a panel crossing behind the eye preserves the board and the visible panel", async () => {
  // The manually shortened panel is an independent oracle. Snapshot the actual
  // output separately so the fix produces a visible image change in GitHub.
  const expected = renderPanelScene(true)
  const actual = renderPanelScene(false)
  await expect(
    await encodePNG(
      annotateClipping(
        expected.bitmap,
        "EXPECTED",
        "DISPLAY CLIPPED BY HAND AT NEAR PLANE",
        true,
      ),
    ),
  ).toMatchPngSnapshot(import.meta.path, "near-plane-expected")
  await expect(
    await encodePNG(
      annotateClipping(
        actual.bitmap,
        "ACTUAL RENDER",
        "DISPLAY EXTENDS BEHIND THE CAMERA",
        true,
      ),
    ),
  ).toMatchPngSnapshot(import.meta.path, "near-plane-actual")
  await expect(
    await encodePNG(clippingComparison(expected.bitmap, actual.bitmap)),
  ).toMatchPngSnapshot(import.meta.path, "near-plane-comparison")
  // These assertions intentionally fail on the regression branch even after
  // recording its broken actual-render snapshot.
  expect([
    ...actual.buffer.slice((256 * 512 + 256) * 4, (256 * 512 + 256) * 4 + 4),
  ]).toEqual([38, 255, 76, 255])
  expect([
    ...actual.buffer.slice((480 * 512 + 256) * 4, (480 * 512 + 256) * 4 + 4),
  ]).toEqual([63, 153, 255, 255])
  expect(actual.buffer).toEqual(expected.buffer)
})

// Coordinates below are intersections computed by hand with z=-1. Attributes
// are affine functions of position, so their expected values are independent
// of the clipping implementation as well.
const cases = [
  {
    name: "one-behind-eye",
    original: [-1, -1, -2, 1, -1, -2, 0, 2, 2],
    clipped: [-1, -1, -2, 1, -1, -2, 0.75, -0.25, -1, -0.75, -0.25, -1],
    indices: [0, 1, 2, 0, 2, 3],
  },
  {
    name: "two-behind-eye",
    original: [-1, -1, 2, 1, -1, 2, 0, 0, -2],
    clipped: [0.25, -0.25, -1, 0, 0, -2, -0.25, -0.25, -1],
    indices: [0, 1, 2],
  },
  {
    name: "vertex-on-eye-plane",
    original: [-1, -1, -2, 1, -1, -2, 0, 1, 0],
    clipped: [-1, -1, -2, 1, -1, -2, 0.5, 0, -1, -0.5, 0, -1],
    indices: [0, 1, 2, 0, 2, 3],
  },
  {
    name: "between-eye-and-near-plane",
    original: [-1, -1, -2, 1, -1, -2, 0, 1, -0.5],
    clipped: [-1, -1, -2, 1, -1, -2, 1 / 3, 1 / 3, -1, -1 / 3, 1 / 3, -1],
    indices: [0, 1, 2, 0, 2, 3],
  },
  {
    name: "fully-behind-eye",
    original: [-1, -1, 2, 1, -1, 2, 0, 1, 2],
    clipped: [],
    indices: [],
  },
]

function renderAttributedTriangle(
  positions: number[],
  indices: number[] | null,
  transformed = false,
) {
  const renderer = new SoftwareRenderer(128, 128)
  renderer.clear([12, 15, 20, 255])
  const geometry = mesh(positions, indices ?? [])
  if (indices === null) geometry.indices = null
  geometry.normals = new Float32Array(
    positions.map((value, i) => (i % 3 === 2 ? 1 : value * 0.3)),
  )
  geometry.uvs = new Float32Array(
    positions.flatMap((value, i) => (i % 3 === 2 ? [] : [value * 0.25 + 0.5])),
  )
  geometry.colors = new Float32Array(
    positions.map((value, i) => (i % 3 === 2 ? 1 : value * 0.2 + 0.7)),
  )
  const textureMaterial: Material = {
    ...material,
    baseColorTexture: {
      width: 4,
      height: 4,
      data: new Uint8Array(
        Array.from({ length: 16 }, (_, i) => [
          50 + (i % 4) * 60,
          50 + Math.floor(i / 4) * 60,
          120,
          255,
        ]).flat(),
      ),
    },
  }
  const view = mat4.create()
  if (transformed) {
    mat4.translate(geometry.model, geometry.model, [2, 0, -3])
    mat4.translate(view, view, [-2, 0, 3])
  }
  renderer.drawMesh(
    geometry,
    { ...camera, view },
    { dir: [0, 0, -1], ambient: 0.2 },
    textureMaterial,
    true,
    false,
  )
  return renderer
}

for (const fixture of cases) {
  test(`near-plane clipping preserves attributes: ${fixture.name}`, async () => {
    const expected = renderAttributedTriangle(fixture.clipped, fixture.indices)
    if (fixture.clipped.length) {
      const drawnPixels = Array.from(expected.buffer).filter(
        (value, i) => i % 4 === 0 && value !== 12,
      ).length
      expect(drawnPixels).toBeGreaterThan(32)
    }
    await expect(await png(expected)).toMatchPngSnapshot(
      import.meta.path,
      fixture.name,
    )
    // Exercise non-indexed meshes and a non-identity model/view transform.
    const actual = renderAttributedTriangle(fixture.original, null, true)
    await expect(await png(actual)).toMatchPngSnapshot(
      import.meta.path,
      fixture.name,
    )
    let maxDifference = 0
    for (let i = 0; i < actual.buffer.length; i++) {
      maxDifference = Math.max(
        maxDifference,
        Math.abs(actual.buffer[i]! - expected.buffer[i]!),
      )
    }
    expect(maxDifference).toBeLessThanOrEqual(2)
  })
}
