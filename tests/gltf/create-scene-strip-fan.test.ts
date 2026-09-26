import { expect, test } from "bun:test"
import { createSceneFromGLTF } from "../../lib/gltf/createSceneFromGLTF"

function sceneFromPrimitive(options: {
  mode?: number
  positions: Float32Array
  indices?: Uint16Array
}) {
  const indexBytes = options.indices
    ? new Uint8Array(options.indices.buffer)
    : null
  const buffer = new Uint8Array(
    options.positions.byteLength + (indexBytes?.byteLength ?? 0),
  )
  buffer.set(new Uint8Array(options.positions.buffer), 0)
  if (indexBytes) {
    buffer.set(indexBytes, options.positions.byteLength)
  }

  const gltf: any = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: options.positions.byteLength },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: options.positions.length / 3,
        type: "VEC3",
      },
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            mode: options.mode,
            ...(options.indices ? { indices: 1 } : {}),
          },
        ],
      },
    ],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  }

  if (options.indices && indexBytes) {
    gltf.bufferViews.push({
      buffer: 0,
      byteOffset: options.positions.byteLength,
      byteLength: indexBytes.byteLength,
    })
    gltf.accessors.push({
      bufferView: 1,
      componentType: 5123,
      count: options.indices.length,
      type: "SCALAR",
    })
  }

  return createSceneFromGLTF(gltf, { buffers: [buffer], images: [] })
}

const quadPositions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0])

test("createSceneFromGLTF draws TRIANGLE_STRIP and TRIANGLE_FAN meshes", () => {
  const strip = sceneFromPrimitive({
    mode: 5,
    positions: quadPositions,
    indices: new Uint16Array([0, 1, 2, 3]),
  })
  expect(strip.drawCalls).toHaveLength(1)
  expect(Array.from(strip.drawCalls[0]!.indices!)).toEqual([0, 1, 2, 2, 1, 3])

  const fan = sceneFromPrimitive({
    mode: 6,
    positions: quadPositions,
    indices: new Uint16Array([0, 1, 3, 2]),
  })
  expect(Array.from(fan.drawCalls[0]!.indices!)).toEqual([0, 1, 3, 0, 3, 2])
})

test("createSceneFromGLTF still skips line primitives", () => {
  const lines = sceneFromPrimitive({
    mode: 1,
    positions: quadPositions,
    indices: new Uint16Array([0, 1, 1, 2]),
  })
  expect(lines.drawCalls).toHaveLength(0)
})
