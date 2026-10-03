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
