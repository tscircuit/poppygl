import { expect, test } from "bun:test"
import { mat4 } from "gl-matrix"
import {
  createSceneFromGLTF,
  createUint8Bitmap,
  encodePNG,
  renderDrawCalls,
  SoftwareRenderer,
  type Material,
} from "../../lib"
import "../fixtures/preload"

const geometry = {
  positions: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  uvs: new Float32Array([0, 0, 0, 0, 0, 0]),
  indices: new Uint32Array([0, 1, 2]),
  model: mat4.create(),
}

function pixel(material: Material, gamma = false) {
  const renderer = new SoftwareRenderer(3, 3)
  renderer.clear([0, 0, 0, 0])
  renderer.drawMesh(
    { ...geometry, material },
    { view: mat4.create(), proj: mat4.create() },
    { dir: [0, 0, 1], ambient: 0 },
    material,
    false,
    gamma,
  )
  return [...renderer.buffer.slice(16, 20)]
}
const dark: Material = { baseColorFactor: [0, 0, 0, 1], baseColorTexture: null }

test("emission survives darkness, strength, and sRGB output", () => {
  expect(pixel(dark)).toEqual([0, 0, 0, 255])
  expect(
    pixel({ ...dark, emissiveFactor: [0.25, 0.1, 0], emissiveStrength: 2 }),
  ).toEqual([127, 51, 0, 255])
  expect(
    pixel({ ...dark, emissiveFactor: [0.5, 0, 0] }, true)[0],
  ).toBeGreaterThan(180)
  expect(
    pixel({
      ...dark,
      emissiveFactor: [1, 0, 0],
      alphaMode: "MASK",
      alphaCutoff: 0.5,
      baseColorFactor: [0, 0, 0, 0.1],
    }),
  ).toEqual([0, 0, 0, 0])
})

test("glTF loads emissive factors, texture, and strength; texture RGB is decoded from sRGB", () => {
  const texture = createUint8Bitmap(1, 1)
  texture.data.set([128, 255, 0, 0]) // Texture alpha does not reduce emission.
  const gltf: any = {
    materials: [
      {
        emissiveFactor: [1, 0.25, 1],
        emissiveTexture: { index: 0 },
        extensions: {
          KHR_materials_emissive_strength: { emissiveStrength: 2 },
        },
      },
    ],
    textures: [{ source: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
    bufferViews: [{ buffer: 0, byteLength: 36 }],
  }
  const scene = createSceneFromGLTF(gltf, {
    buffers: [new Uint8Array(geometry.positions.buffer)],
    images: [texture],
  })
  const material = scene.drawCalls[0]!.material
  expect(material.emissiveStrength).toBe(2)
  expect(material.emissiveTexture).toBe(texture)
  expect(pixel({ ...material, baseColorFactor: [0, 0, 0, 1] })).toEqual([
    110, 127, 0, 255,
  ])
})

for (const realistic of [false, true]) {
  test(`emissive materials visual snapshot (realistic=${realistic})`, async () => {
    const draws = [0, 0.25, 0.75].map((strength, index) => ({
      ...geometry,
      model: mat4.fromTranslation(mat4.create(), [(index - 1) * 2.5, 0, 0]),
      material: {
        ...dark,
        metallicFactor: 0,
        roughnessFactor: 1,
        emissiveFactor: [0.1, 0.8, 0.3] as [number, number, number],
        emissiveStrength: strength,
      },
    }))
    const result = renderDrawCalls(draws, {
      width: 300,
      height: 140,
      supersampling: 1,
      realistic,
      backgroundColor: "#202020",
      camPos: [0, 0, 9],
      lookAt: [0, 0, 0],
    })
    await expect(await encodePNG(result.bitmap)).toMatchPngSnapshot(
      import.meta.path,
      realistic ? "emissive-realistic" : "emissive-default",
    )
  })
}
