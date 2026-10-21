import { expect, test } from "bun:test"
import { mat4 } from "gl-matrix"
import { SoftwareRenderer } from "../../lib/render/SoftwareRenderer"
import { encodePNG } from "../../lib/image/encodePNG"
import { createSceneFromGLTF } from "../../lib/gltf/createSceneFromGLTF"
import {
  GLTF_WRAP_CLAMP_TO_EDGE,
  GLTF_WRAP_MIRRORED_REPEAT,
  GLTF_WRAP_REPEAT,
  type TextureWrap,
  wrapTextureCoordinate,
} from "../../lib/utils/wrapTextureCoordinate"
import "../fixtures/preload"

const SIZE = 64

// 3x1 texture sampled as left half red, right half blue
// (nearest sampling maps u in [0, 1] onto texels 0..width-1).
const redBlue = {
  width: 3,
  height: 1,
  data: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255]),
}

// Full-viewport quad whose U runs from -1 to 3, so four texture widths span the image.
function renderQuad(wrap?: TextureWrap) {
  const renderer = new SoftwareRenderer(SIZE, SIZE)
  const material = {
    baseColorFactor: [1, 1, 1, 1] as [number, number, number, number],
    baseColorTexture: redBlue,
    baseColorTextureWrap: wrap,
  }
  renderer.clear([0, 0, 0, 1])
  renderer.drawMesh(
    {
      positions: new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
      uvs: new Float32Array([-1, 0, 3, 0, 3, 1, -1, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      model: mat4.create(),
      material,
    },
    { view: mat4.create(), proj: mat4.create() },
    { dir: [0, 0, -1], ambient: 1 },
    material,
    false,
  )
  return renderer
}

// Dominant channel per column along the middle row: "r" or "b".
function columnColors(renderer: SoftwareRenderer) {
  const y = SIZE / 2
  return Array.from({ length: SIZE }, (_, x) => {
    const i = (y * SIZE + x) * 4
    return renderer.buffer[i]! > renderer.buffer[i + 2]! ? "r" : "b"
  })
}

// Collapse consecutive equal entries: ["r","r","b"] -> ["r","b"].
function runs(cols: string[]) {
  return cols.filter((c, i) => i === 0 || c !== cols[i - 1])
}

test("wrapTextureCoordinate follows glTF wrap modes outside [0, 1]", () => {
  expect(wrapTextureCoordinate(1.25)).toBeCloseTo(0.25)
  expect(wrapTextureCoordinate(-0.25)).toBeCloseTo(0.75)
  expect(wrapTextureCoordinate(1.25, GLTF_WRAP_REPEAT)).toBeCloseTo(0.25)
  expect(wrapTextureCoordinate(1.25, GLTF_WRAP_CLAMP_TO_EDGE)).toBe(1)
  expect(wrapTextureCoordinate(-0.25, GLTF_WRAP_CLAMP_TO_EDGE)).toBe(0)
  expect(wrapTextureCoordinate(1.25, GLTF_WRAP_MIRRORED_REPEAT)).toBeCloseTo(
    0.75,
  )
  expect(wrapTextureCoordinate(-0.25, GLTF_WRAP_MIRRORED_REPEAT)).toBeCloseTo(
    0.25,
  )
  // In-range coordinates are untouched, including the 1.0 edge.
  for (const mode of [
    GLTF_WRAP_REPEAT,
    GLTF_WRAP_CLAMP_TO_EDGE,
    GLTF_WRAP_MIRRORED_REPEAT,
  ]) {
    expect(wrapTextureCoordinate(0, mode)).toBe(0)
    expect(wrapTextureCoordinate(0.5, mode)).toBe(0.5)
    expect(wrapTextureCoordinate(1, mode)).toBe(1)
  }
})

test("textures repeat by default when UVs leave [0, 1]", async () => {
  const renderer = renderQuad()
  expect(runs(columnColors(renderer))).toEqual([
    "r",
    "b",
    "r",
    "b",
    "r",
    "b",
    "r",
    "b",
  ])
  await expect(
    await encodePNG({ width: SIZE, height: SIZE, data: renderer.buffer }),
  ).toMatchPngSnapshot(import.meta.path, "texture-wrap-repeat")
})

test("CLAMP_TO_EDGE sampler keeps edge texels outside [0, 1]", async () => {
  const renderer = renderQuad({
    wrapS: GLTF_WRAP_CLAMP_TO_EDGE,
    wrapT: GLTF_WRAP_CLAMP_TO_EDGE,
  })
  expect(runs(columnColors(renderer))).toEqual(["r", "b"])
  await expect(
    await encodePNG({ width: SIZE, height: SIZE, data: renderer.buffer }),
  ).toMatchPngSnapshot(import.meta.path, "texture-wrap-clamp")
})

test("MIRRORED_REPEAT sampler mirrors every other tile", async () => {
  const renderer = renderQuad({
    wrapS: GLTF_WRAP_MIRRORED_REPEAT,
    wrapT: GLTF_WRAP_MIRRORED_REPEAT,
  })
  expect(runs(columnColors(renderer))).toEqual(["b", "r", "b", "r", "b"])
  await expect(
    await encodePNG({ width: SIZE, height: SIZE, data: renderer.buffer }),
  ).toMatchPngSnapshot(import.meta.path, "texture-wrap-mirrored-repeat")
})

test("createSceneFromGLTF reads sampler wrap modes and defaults to REPEAT", () => {
  // One triangle, two materials: material 0 uses a clamping sampler, material 1 has no sampler.
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
  const gltf = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [{ mesh: 0 }, { mesh: 1 }],
    meshes: [
      { primitives: [{ attributes: { POSITION: 0 }, material: 0 }] },
      { primitives: [{ attributes: { POSITION: 0 }, material: 1 }] },
    ],
    materials: [
      { pbrMetallicRoughness: { baseColorTexture: { index: 0 } } },
      { pbrMetallicRoughness: { baseColorTexture: { index: 1 } } },
    ],
    textures: [{ source: 0, sampler: 0 }, { source: 0 }],
    samplers: [
      { wrapS: GLTF_WRAP_CLAMP_TO_EDGE, wrapT: GLTF_WRAP_MIRRORED_REPEAT },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
    ],
    buffers: [{ byteLength: positions.byteLength }],
  }
  const scene = createSceneFromGLTF(
    gltf as any,
    {
      buffers: [new Uint8Array(positions.buffer)],
      images: [redBlue],
    } as any,
  )
  expect(scene.drawCalls[0]!.material.baseColorTextureWrap).toEqual({
    wrapS: GLTF_WRAP_CLAMP_TO_EDGE,
    wrapT: GLTF_WRAP_MIRRORED_REPEAT,
  })
  expect(scene.drawCalls[1]!.material.baseColorTextureWrap).toEqual({
    wrapS: GLTF_WRAP_REPEAT,
    wrapT: GLTF_WRAP_REPEAT,
  })
})
