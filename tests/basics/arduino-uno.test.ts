import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { mat4 } from "gl-matrix"
import { computeWorldAABB } from "../../lib/gltf/computeWorldAABB.ts"
import { createSceneFromGLTF } from "../../lib/gltf/createSceneFromGLTF.ts"
import {
  bufferFromDataURI,
  decodeImageFromBuffer,
} from "../../lib/gltf/resourceUtils.ts"
import { parseGLB } from "../../lib/gltf/parseGLB.ts"
import { encodePNGToBuffer } from "../../lib/image/encodePNGToBuffer.ts"
import { pureImageFactory } from "../../lib/image/pureImageFactory.ts"
import { renderDrawCalls } from "../../lib/render/renderDrawCalls.ts"
import "../fixtures/preload.ts"

async function renderRotatedGLB(
  glb: Uint8Array,
  rotationDegreesY: number,
): Promise<Buffer> {
  const arrayBuffer = new Uint8Array(glb).slice().buffer as ArrayBuffer
  const { gltf, binaryChunk } = parseGLB(arrayBuffer)

  const totalBuffers = Array.isArray(gltf.buffers) ? gltf.buffers.length : 0
  const buffers: Uint8Array[] = new Array(totalBuffers)

  for (let index = 0; index < totalBuffers; index += 1) {
    const entry = gltf.buffers[index]
    if (entry?.uri) {
      buffers[index] = bufferFromDataURI(entry.uri)
      continue
    }

    if (!binaryChunk) {
      throw new Error(
        `GLB is missing the binary chunk required for buffer ${index}.`,
      )
    }

    buffers[index] = binaryChunk
  }

  const resolveBufferViewSlice = (bufferViewIndex: number): Uint8Array => {
    const bufferView = gltf.bufferViews?.[bufferViewIndex]
    if (!bufferView) {
      throw new Error(`Invalid bufferView index ${bufferViewIndex}.`)
    }
    const buffer = buffers[bufferView.buffer]
    if (!buffer) {
      throw new Error(
        `Missing buffer data for bufferView ${bufferViewIndex} (buffer ${bufferView.buffer}).`,
      )
    }

    const byteOffset = bufferView.byteOffset ?? 0
    return buffer.subarray(byteOffset, byteOffset + bufferView.byteLength)
  }

  const images = await Promise.all(
    (gltf.images ?? []).map(async (image: any) =>
      image.uri
        ? decodeImageFromBuffer(bufferFromDataURI(image.uri), image.mimeType)
        : decodeImageFromBuffer(
            resolveBufferViewSlice(image.bufferView),
            image.mimeType,
          ),
    ),
  )

  const scene = createSceneFromGLTF(gltf, { buffers, images })
  const aabb = computeWorldAABB(scene.drawCalls)
  const centerX = (aabb.min[0]! + aabb.max[0]!) / 2
  const centerY = (aabb.min[1]! + aabb.max[1]!) / 2
  const centerZ = (aabb.min[2]! + aabb.max[2]!) / 2

  const rotation = mat4.create()
  mat4.translate(rotation, rotation, [centerX, centerY, centerZ])
  mat4.rotateY(rotation, rotation, (rotationDegreesY * Math.PI) / 180)
  mat4.translate(rotation, rotation, [-centerX, -centerY, -centerZ])

  const rotatedModels = new Set<mat4>()
  for (const drawCall of scene.drawCalls) {
    if (rotatedModels.has(drawCall.model)) continue
    const originalModel = mat4.clone(drawCall.model)
    mat4.multiply(drawCall.model, rotation, originalModel)
    rotatedModels.add(drawCall.model)
  }

  const { bitmap } = renderDrawCalls(
    scene.drawCalls,
    {
      width: 960,
      height: 720,
      supersampling: 2,
      fov: 4,
      camPos: [0, 1200, 0],
      up: "y+",
      cameraRotation: { x: -90, y: 0, z: 0 },
      backgroundColor: [1, 1, 1],
    },
    pureImageFactory,
  )

  return encodePNGToBuffer(bitmap)
}

test(
  "arduino uno top down snapshot",
  async () => {
    const glbPath = fileURLToPath(
      new URL("../fixtures/assets/arduino-uno.glb", import.meta.url),
    )
    const glb = await readFile(glbPath)
    const pngBuffer = await renderRotatedGLB(glb, 90)

    await expect(pngBuffer).toMatchPngSnapshot(import.meta.path)
  },
  { timeout: 180_000 },
)
