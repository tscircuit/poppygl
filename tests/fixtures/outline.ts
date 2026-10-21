import { mat4 } from "gl-matrix"
import { geometries, primitives } from "@jscad/modeling"
import {
  createUint8Bitmap,
  type DrawCall,
  type renderDrawCalls,
} from "../../lib"

export function mesh(shape = primitives.cuboid({ size: [2, 2, 2] })): DrawCall {
  const positions: number[] = []
  for (const poly of geometries.geom3.toPolygons(shape))
    for (let i = 1; i + 1 < poly.vertices.length; i++)
      positions.push(
        ...poly.vertices[0]!,
        ...poly.vertices[i]!,
        ...poly.vertices[i + 1]!,
      )
  return {
    positions: new Float32Array(positions),
    indices: null,
    normals: null,
    uvs: null,
    model: mat4.create(),
    material: {
      baseColorFactor: [1, 0, 0, 0.1],
      baseColorTexture: null,
      alphaMode: "BLEND",
    },
    showHiddenEdges: true,
  }
}
export const options = {
  renderStyle: "outline" as const,
  width: 200,
  height: 200,
  camPos: [4, 3, 6] as const,
  lookAt: [0, 0, 0] as const,
  supersampling: 2,
  edgeWidth: 1.5,
}
export function ink(data: Uint8Array | Uint8ClampedArray) {
  let sum = 0
  for (let i = 0; i < data.length; i += 4) sum += 255 - data[i]!
  return sum
}
export function comparison(
  images: ReturnType<typeof renderDrawCalls>["bitmap"][],
) {
  const result = createUint8Bitmap(200 * images.length, 200)
  for (const [column, image] of images.entries())
    for (let y = 0; y < 200; y++)
      result.data.set(
        image.data.subarray(y * 800, (y + 1) * 800),
        (y * result.width + column * 200) * 4,
      )
  return result
}
