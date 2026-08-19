import { mat4 } from "gl-matrix"
import type { DrawCall, Material } from "../../lib/gltf/types"
import { encodePNGToBuffer } from "../../lib/image/encodePNGToBuffer"
import { pureImageFactory } from "../../lib/image/pureImageFactory"
import type { RenderOptionsInput } from "../../lib/render/getDefaultRenderOptions"
import { renderDrawCalls } from "../../lib/render/renderDrawCalls"

export function makeQuad(
  cx: number,
  material: Material,
  opts?: { uv?: boolean },
): DrawCall {
  const positions = new Float32Array([
    cx - 0.8,
    -1.2,
    0,
    cx + 0.8,
    -1.2,
    0,
    cx + 0.8,
    1.2,
    0,
    cx - 0.8,
    1.2,
    0,
  ])
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1])
  const uvs = opts?.uv ? new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]) : null
  return {
    positions,
    normals,
    uvs,
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    model: mat4.create(),
    material,
  }
}

export const CHECKER_TEXTURE = {
  width: 2,
  height: 2,
  data: new Uint8Array([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
  ]),
}

const BASE_CAMERA = {
  width: 256,
  height: 192,
  camPos: [0, 0, 6],
  lookAt: [0, 0, 0],
  up: "y+",
  fov: 60,
} as const

export async function renderSceneToPng(
  drawCalls: DrawCall[],
  options: RenderOptionsInput,
): Promise<Buffer> {
  const { bitmap } = renderDrawCalls(
    drawCalls,
    { ...BASE_CAMERA, ...options },
    pureImageFactory,
  )
  return encodePNGToBuffer(bitmap)
}
