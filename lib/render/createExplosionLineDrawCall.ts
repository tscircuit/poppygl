import { mat4, vec4 } from "gl-matrix"
import type { Camera } from "../camera/buildCamera"
import type { DrawCall } from "../gltf/types"
import type { ExplosionLine } from "./getDefaultRenderOptions"

/** Scene-world points in the caller's glTF units and handedness. Identity model
 * transform: the caller has already transformed its assembly coordinates.
 */
export function createExplosionLineDrawCall(line: ExplosionLine): DrawCall {
  if (
    line.points.length < 2 ||
    line.points.some(
      (point) => point.length !== 3 || !point.every(Number.isFinite),
    )
  ) {
    throw new Error("Explosion lines need at least two finite XYZ points")
  }
  const color = line.color ?? [0.08, 0.2, 0.35]
  if (
    color.length !== 3 ||
    color.some(
      (channel) => !Number.isFinite(channel) || channel < 0 || channel > 1,
    )
  ) {
    throw new Error(
      "Explosion line colors must be linear RGB values from 0 to 1",
    )
  }
  const indices: number[] = []
  for (let vertex = 1; vertex < line.points.length; vertex++) {
    indices.push(vertex - 1, vertex)
  }
  return {
    positions: new Float32Array(line.points.flatMap((point) => [...point])),
    indices: new Uint32Array(indices),
    normals: null,
    uvs: null,
    model: mat4.create(),
    material: { baseColorFactor: [...color, 1], baseColorTexture: null },
    mode: 1,
  }
}

/** Clip scene-world guide segments against all six homogeneous camera planes
 * before rasterization. Avoid mirrored lines behind the eye and unbounded DDA
 * iteration for off-screen endpoints. New vertices remain scene-world points.
 */
export function clipExplosionLineDrawCall(
  drawCall: DrawCall,
  camera: Camera,
): DrawCall {
  const viewProjection = mat4.multiply(mat4.create(), camera.proj, camera.view)
  const positions: number[] = []
  const indices: number[] = []
  const distances = (point: vec4) => [
    point[3] + point[0],
    point[3] - point[0],
    point[3] + point[1],
    point[3] - point[1],
    point[3] + point[2],
    point[3] - point[2],
  ]
  for (let segment = 0; segment < drawCall.indices!.length; segment += 2) {
    const startIndex = drawCall.indices![segment]! * 3
    const endIndex = drawCall.indices![segment + 1]! * 3
    const start = vec4.fromValues(
      drawCall.positions[startIndex]!,
      drawCall.positions[startIndex + 1]!,
      drawCall.positions[startIndex + 2]!,
      1,
    )
    const end = vec4.fromValues(
      drawCall.positions[endIndex]!,
      drawCall.positions[endIndex + 1]!,
      drawCall.positions[endIndex + 2]!,
      1,
    )
    const startDistances = distances(
      vec4.transformMat4(vec4.create(), start, viewProjection),
    )
    const endDistances = distances(
      vec4.transformMat4(vec4.create(), end, viewProjection),
    )
    let from = 0
    let to = 1
    for (let plane = 0; plane < 6; plane++) {
      const a = startDistances[plane]!
      const b = endDistances[plane]!
      if (a < 0 && b < 0) {
        to = -1
        break
      }
      if (a < 0 !== b < 0) {
        const intersection = a / (a - b)
        if (a < 0) from = Math.max(from, intersection)
        else to = Math.min(to, intersection)
      }
    }
    if (from > to) continue
    const vertex = positions.length / 3
    for (const progress of [from, to]) {
      for (let axis = 0; axis < 3; axis++) {
        positions.push(start[axis]! + progress * (end[axis]! - start[axis]!))
      }
    }
    indices.push(vertex, vertex + 1)
  }
  return {
    ...drawCall,
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  }
}
