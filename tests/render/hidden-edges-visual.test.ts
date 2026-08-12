import { expect, test } from "bun:test"
import {
  createEdgeDrawCall,
  createSceneFromGLTF,
  renderSceneFromGLTF,
} from "../../lib"
import { encodePNGToBuffer } from "../../lib/image/encodePNGToBuffer"
import { pureImageFactory } from "../../lib/image/pureImageFactory"
import "../fixtures/preload"

interface SceneExtrasOptions {
  meshExtras?: unknown
  primitiveExtras?: unknown
  firstNodeExtras?: unknown
  secondNodeExtras?: unknown
}

function createTwoCubeScene(options: SceneExtrasOptions = {}) {
  const positions = new Float32Array([
    -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1,
    -1, 1, 1,
  ])
  const indices = new Uint16Array([
    4, 5, 6, 4, 6, 7, 1, 0, 3, 1, 3, 2, 0, 4, 7, 0, 7, 3, 5, 1, 2, 5, 2, 6, 7,
    6, 2, 7, 2, 3, 0, 1, 5, 0, 5, 4,
  ])
  const buffer = new Uint8Array(positions.byteLength + indices.byteLength)
  buffer.set(new Uint8Array(positions.buffer), 0)
  buffer.set(new Uint8Array(indices.buffer), positions.byteLength)

  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      {
        buffer: 0,
        byteOffset: positions.byteLength,
        byteLength: indices.byteLength,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 8,
        type: "VEC3",
      },
      {
        bufferView: 1,
        componentType: 5123,
        count: indices.length,
        type: "SCALAR",
      },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [0.64, 0.76, 0.88, 1],
        },
      },
    ],
    meshes: [
      {
        extras: options.meshExtras,
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
            material: 0,
            extras: options.primitiveExtras,
          },
        ],
      },
    ],
    nodes: [
      {
        mesh: 0,
        translation: [-1.35, 0, 0],
        extras: options.firstNodeExtras,
      },
      {
        mesh: 0,
        translation: [1.35, 0, 0],
        extras: options.secondNodeExtras ?? { showHiddenEdges: true },
      },
    ],
    scenes: [{ nodes: [0, 1] }],
    scene: 0,
  }

  return createSceneFromGLTF(gltf, { buffers: [buffer], images: [] })
}

test("showHiddenEdges extras use primitive, node, then mesh precedence", () => {
  const meshFallback = createTwoCubeScene({
    meshExtras: { showHiddenEdges: true },
    secondNodeExtras: { showHiddenEdges: false },
  })
  expect(
    meshFallback.drawCalls.map((drawCall) => drawCall.showHiddenEdges),
  ).toEqual([true, false])

  const nodeOverride = createTwoCubeScene({
    meshExtras: { showHiddenEdges: false },
    firstNodeExtras: { poppygl: { showHiddenEdges: true } },
    secondNodeExtras: { showHiddenEdges: true },
  })
  expect(
    nodeOverride.drawCalls.map((drawCall) => drawCall.showHiddenEdges),
  ).toEqual([true, true])

  const primitiveOverride = createTwoCubeScene({
    primitiveExtras: { showHiddenEdges: false },
    firstNodeExtras: { showHiddenEdges: true },
    secondNodeExtras: { poppygl: { showHiddenEdges: true } },
  })
  expect(
    primitiveOverride.drawCalls.map((drawCall) => drawCall.showHiddenEdges),
  ).toEqual([false, false])
})

test("showHiddenEdges renders only tagged glTF nodes", async () => {
  const scene = createTwoCubeScene()
  expect(scene.drawCalls.map((drawCall) => drawCall.showHiddenEdges)).toEqual([
    false,
    true,
  ])

  const edgeDrawCall = createEdgeDrawCall(scene.drawCalls[1]!)
  expect(edgeDrawCall?.indices?.length).toBe(24)

  const { bitmap } = renderSceneFromGLTF(
    scene,
    {
      width: 500,
      height: 260,
      camPos: [4, 3, 7],
      lookAt: [0, 0, 0],
      ambient: 1,
      backgroundColor: [1, 1, 1],
    },
    pureImageFactory,
  )
  const pngBuffer = await encodePNGToBuffer(bitmap)
  await expect(pngBuffer).toMatchPngSnapshot(import.meta.path)
})
