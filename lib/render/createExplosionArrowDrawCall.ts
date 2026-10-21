import { mat4, vec4 } from "gl-matrix"
import type { Camera } from "../camera/buildCamera"
import type { DrawCall } from "../gltf/types"
import { clipExplosionLineDrawCall } from "./createExplosionLineDrawCall"

/** A camera-facing open arrowhead at the authored endpoint. Building it after
 * the camera keeps its size in output pixels without changing scene bounds.
 * It retains the endpoint's depth, so geometry can occlude it like the shaft.
 */
export function createExplosionArrowDrawCall(
  drawCall: DrawCall,
  camera: Camera,
  width: number,
  height: number,
  supersampling: number,
): DrawCall | null {
  if (width <= 1 || height <= 1) return null
  const points = drawCall.positions
  const end = points.length - 3
  let start = end - 3
  // Trailing repeated points must not erase the direction of a polyline.
  while (
    start >= 0 &&
    points[start] === points[end] &&
    points[start + 1] === points[end + 1] &&
    points[start + 2] === points[end + 2]
  ) {
    start -= 3
  }
  if (start < 0) return null

  const viewProjection = mat4.multiply(mat4.create(), camera.proj, camera.view)
  const tip = vec4.transformMat4(
    vec4.create(),
    vec4.fromValues(points[end]!, points[end + 1]!, points[end + 2]!, 1),
    viewProjection,
  )
  // Never put an arrow on a clipped shaft endpoint or mirror one behind the eye.
  if (
    !Array.from(tip).every(Number.isFinite) ||
    tip[3] <= 0 ||
    Math.abs(tip[0]) > tip[3] ||
    Math.abs(tip[1]) > tip[3] ||
    Math.abs(tip[2]) > tip[3]
  ) {
    return null
  }

  const clipped = clipExplosionLineDrawCall(
    {
      ...drawCall,
      positions: new Float32Array([
        points[start]!,
        points[start + 1]!,
        points[start + 2]!,
        points[end]!,
        points[end + 1]!,
        points[end + 2]!,
      ]),
      indices: new Uint32Array([0, 1]),
    },
    camera,
  )
  if (!clipped.indices?.length) return null
  const tail = vec4.transformMat4(
    vec4.create(),
    vec4.fromValues(
      clipped.positions[0]!,
      clipped.positions[1]!,
      clipped.positions[2]!,
      1,
    ),
    viewProjection,
  )
  if (tail[3] <= 0) return null
  const dx = ((tip[0] / tip[3] - tail[0] / tail[3]) * (width - 1)) / 2
  const dy = ((tip[1] / tip[3] - tail[1] / tail[3]) * (height - 1)) / 2
  const length = Math.hypot(dx, dy)
  if (!Number.isFinite(length) || length < 0.001) return null

  const arrowLength = Math.min(10 * supersampling, length / 2)
  const ux = dx / length
  const uy = dy / length
  const inverse = mat4.invert(mat4.create(), viewProjection)
  if (!inverse) return null
  const positions = [points[end]!, points[end + 1]!, points[end + 2]!]
  for (const side of [-1, 1]) {
    const offsetX = -ux * arrowLength - side * uy * arrowLength * 0.45
    const offsetY = -uy * arrowLength + side * ux * arrowLength * 0.45
    const wing = vec4.transformMat4(
      vec4.create(),
      vec4.fromValues(
        tip[0] / tip[3] + (2 * offsetX) / (width - 1),
        tip[1] / tip[3] + (2 * offsetY) / (height - 1),
        tip[2] / tip[3],
        1,
      ),
      inverse,
    )
    if (!Array.from(wing).every(Number.isFinite) || wing[3] === 0) return null
    positions.push(wing[0] / wing[3], wing[1] / wing[3], wing[2] / wing[3])
  }
  return {
    ...drawCall,
    positions: new Float32Array(positions),
    indices: new Uint32Array([0, 1, 0, 2]),
  }
}
