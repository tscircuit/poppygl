import { expect, test } from "bun:test"
import { mat4 } from "gl-matrix"
import type { DrawCall, Material } from "../../lib/gltf/types"
import { encodePNG } from "../../lib/image/encodePNG"
import { SoftwareRenderer } from "../../lib/render/SoftwareRenderer"
import "../fixtures/preload"

const material: Material = {
  baseColorFactor: [1, 1, 1, 1],
  baseColorTexture: null,
}
const camera = {
  view: mat4.create(),
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

// A green board in front of the camera, plus a blue display extending from
// z=-3 to z=+3. The display crosses behind the eye but never covers the board.
// This is the small equivalent of the Muse e-paper thumbnail failure.
function renderPanelScene(preclipped: boolean) {
  const renderer = new SoftwareRenderer(128, 128)
  renderer.clear([0, 0, 0, 255])
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
    mesh([-2, -1, -4, 2, -1, -4, 2, 2, -4, -2, 2, -4], [0, 1, 2, 0, 2, 3]),
    [0, 0.6, 0.2, 1],
  )
  const endZ = preclipped ? -1 : 3 // perspective near plane is z=-1
  draw(
    mesh(
      [-6, -1, -3, 6, -1, -3, 6, -1, endZ, -6, -1, endZ],
      [0, 2, 1, 0, 3, 2],
    ),
    [0.1, 0.3, 0.4, 1],
  )
  return renderer
}

function png(renderer: SoftwareRenderer) {
  return encodePNG({
    width: renderer.width,
    height: renderer.height,
    data: renderer.buffer,
  })
}

test("a panel crossing behind the eye preserves the board and the visible panel", async () => {
  // The oracle is a manually shortened rectangle, not renderer clipping code.
  const expected = renderPanelScene(true)
  await expect(await png(expected)).toMatchPngSnapshot(import.meta.path)
  const actual = renderPanelScene(false)
  await expect(await png(actual)).toMatchPngSnapshot(import.meta.path)
  expect([
    ...actual.buffer.slice((48 * 128 + 64) * 4, (48 * 128 + 64) * 4 + 4),
  ]).toEqual([0, 153, 51, 255])
  expect([
    ...actual.buffer.slice((110 * 128 + 64) * 4, (110 * 128 + 64) * 4 + 4),
  ]).toEqual([25, 76, 102, 255])
})
