import { expect, test } from "bun:test"
import { mat4 } from "gl-matrix"
import type { Material } from "../../lib/gltf/types"
import { encodePNG } from "../../lib/image/encodePNG"
import { SoftwareRenderer } from "../../lib/render/SoftwareRenderer"
import "../fixtures/preload"

const camera = { view: mat4.create(), proj: mat4.create() }

function drawPanel(
  renderer: SoftwareRenderer,
  xMin: number,
  xMax: number,
  material: Material,
) {
  const yMin = -0.65
  const yMax = 0.65

  renderer.drawMesh(
    {
      positions: new Float32Array([
        xMin,
        yMin,
        0,
        xMax,
        yMin,
        0,
        xMax,
        yMax,
        0,
        xMin,
        yMax,
        0,
      ]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
      uvs: null,
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      model: mat4.create(),
      material,
    },
    camera,
    { dir: [0, 0, -1], ambient: 1 },
    material,
    false,
    false,
  )
}

test("glTF material alpha modes visual snapshot", async () => {
  const renderer = new SoftwareRenderer(360, 160)
  renderer.clear([255, 255, 255, 255])

  drawPanel(renderer, -0.9, -0.35, {
    baseColorFactor: [0.9, 0.1, 0.1, 0.25],
    baseColorTexture: null,
    alphaMode: "OPAQUE",
  })
  drawPanel(renderer, -0.275, 0.275, {
    baseColorFactor: [0.1, 0.7, 0.2, 0.75],
    baseColorTexture: null,
    alphaMode: "MASK",
    alphaCutoff: 0.5,
  })
  drawPanel(renderer, 0.35, 0.9, {
    baseColorFactor: [0.1, 0.2, 0.9, 0.5],
    baseColorTexture: null,
    alphaMode: "BLEND",
  })

  const png = await encodePNG(renderer.bitmap)
  await expect(png).toMatchPngSnapshot(import.meta.path)
})
