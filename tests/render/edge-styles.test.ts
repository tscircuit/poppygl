import { expect, test } from "bun:test"
import { mat4 } from "gl-matrix"
import {
  createUint8Bitmap,
  encodePNG,
  renderDrawCalls,
  type BitmapLike,
  type DrawCall,
  type RenderOptionsInput,
} from "../../lib"
import "../fixtures/preload"

function cube(tagged = false): DrawCall {
  return {
    positions: new Float32Array([
      -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1,
      -1, 1, 1,
    ]),
    indices: new Uint32Array([
      4, 5, 6, 4, 6, 7, 1, 0, 3, 1, 3, 2, 0, 4, 7, 0, 7, 3, 5, 1, 2, 5, 2, 6, 7,
      6, 2, 7, 2, 3, 0, 1, 5, 0, 5, 4,
    ]),
    normals: null,
    uvs: null,
    model: mat4.create(),
    material: {
      baseColorFactor: [0.72, 0.82, 0.92, 1],
      baseColorTexture: null,
    },
    showHiddenEdges: tagged,
  }
}

function render(options: RenderOptionsInput = {}, tagged = false) {
  return renderDrawCalls([cube(tagged)], {
    width: 180,
    height: 180,
    camPos: [4, 3, 6],
    lookAt: [0, 0, 0],
    ambient: 1,
    gamma: false,
    backgroundColor: "#ffffff",
    ...options,
  }).bitmap
}

function changedPixels(left: BitmapLike, right: BitmapLike) {
  let count = 0
  for (let i = 0; i < left.data.length; i += 4) {
    if (
      left.data[i] !== right.data[i] ||
      left.data[i + 1] !== right.data[i + 1] ||
      left.data[i + 2] !== right.data[i + 2]
    )
      count++
  }
  return count
}

function addedDarkness(base: BitmapLike, outlined: BitmapLike) {
  let total = 0
  for (let i = 0; i < base.data.length; i += 4) {
    total += Math.max(0, base.data[i]! - outlined.data[i]!)
  }
  return total
}

test("global edges provide visible outlines and optional dashed hidden edges", async () => {
  const baseline = render()
  const visible = render({ showEdges: true, edgeWidth: 2 })
  const hidden = render({ showHiddenEdges: true, edgeWidth: 2 })
  expect(changedPixels(baseline, visible)).toBeGreaterThan(150)
  expect(changedPixels(visible, hidden)).toBeGreaterThan(30)
  expect(addedDarkness(baseline, hidden)).toBeGreaterThan(
    addedDarkness(baseline, visible),
  )

  const comparison = createUint8Bitmap(180 * 3, 180)
  for (const [column, image] of [baseline, visible, hidden].entries()) {
    for (let y = 0; y < 180; y++) {
      comparison.data.set(
        image.data.subarray(y * 180 * 4, (y + 1) * 180 * 4),
        (y * comparison.width + column * 180) * 4,
      )
    }
  }
  await expect(encodePNG(comparison)).toMatchPngSnapshot(import.meta.path)
})

test("global hidden-edge override keeps existing tags and allows disabling them", () => {
  expect(render({}, true).data).toEqual(render({ showHiddenEdges: true }).data)
  expect(render({ showHiddenEdges: false }, true).data).toEqual(render().data)
  expect(render({ showHiddenEdges: null }, true).data).toEqual(
    render({}, true).data,
  )
  expect(
    render({ showEdges: true, showHiddenEdges: false }, true).data,
  ).toEqual(render({ showEdges: true }).data)
})

test("edgeWidth thickens outlines and hiddenEdgeOpacity controls obscured strokes", () => {
  const base = render()
  const thin = render({ showEdges: true, edgeWidth: 1 })
  const thick = render({ showEdges: true, edgeWidth: 5 })
  expect(addedDarkness(base, thick)).toBeGreaterThan(
    addedDarkness(base, thin) * 2,
  )

  const noHidden = render({
    showHiddenEdges: true,
    hiddenEdgeOpacity: 0,
    edgeWidth: 2,
  })
  expect(noHidden.data).toEqual(render({ showEdges: true, edgeWidth: 2 }).data)
  const subtle = render({
    showHiddenEdges: true,
    hiddenEdgeOpacity: 0.2,
    edgeWidth: 2,
  })
  const strong = render({
    showHiddenEdges: true,
    hiddenEdgeOpacity: 0.8,
    edgeWidth: 2,
  })
  expect(addedDarkness(noHidden, strong)).toBeGreaterThan(
    addedDarkness(noHidden, subtle) * 2,
  )
})

test("edgeWidth is measured in output pixels under supersampling", () => {
  const base = render()
  const outlined = render({ showEdges: true, edgeWidth: 4 })
  const sampledBase = render({ supersampling: 3 })
  const sampledOutline = render({
    showEdges: true,
    edgeWidth: 4,
    supersampling: 3,
  })
  const ratio =
    addedDarkness(sampledBase, sampledOutline) / addedDarkness(base, outlined)
  expect(ratio).toBeGreaterThan(0.8)
  expect(ratio).toBeLessThan(1.2)
})
