import { mat4, vec3 } from "gl-matrix"
import type { DrawCall } from "../gltf/types"
import { computeWorldAABB } from "../gltf/computeWorldAABB"
import { toRad } from "../utils/toRad"

export interface Camera {
  view: mat4
  proj: mat4
}

export function buildCamera(
  drawCalls: DrawCall[],
  width: number,
  height: number,
  fovDeg: number,
  camPos: readonly [number, number, number] | null | undefined,
  lookAt: readonly [number, number, number] | null | undefined,
): Camera {
  const aspect = width / height
  const near = 0.01
  const far = 1000.0
  const proj = mat4.create()
  mat4.perspective(proj, toRad(fovDeg), aspect, near, far)

  let eye: vec3
  let center: vec3

  if (camPos) {
    eye = vec3.fromValues(camPos[0], camPos[1], camPos[2])
    if (lookAt) {
      center = vec3.fromValues(lookAt[0], lookAt[1], lookAt[2])
    } else {
      const aabb = computeWorldAABB(drawCalls)
      center = vec3.fromValues(
        0.5 * (aabb.min[0] + aabb.max[0]),
        0.5 * (aabb.min[1] + aabb.max[1]),
        0.5 * (aabb.min[2] + aabb.max[2]),
      )
    }
  } else {
    const aabb = computeWorldAABB(drawCalls)
    center = vec3.fromValues(
      0.5 * (aabb.min[0] + aabb.max[0]),
      0.5 * (aabb.min[1] + aabb.max[1]),
      0.5 * (aabb.min[2] + aabb.max[2]),
    )
    const diag = vec3.distance(
      vec3.fromValues(aabb.min[0], aabb.min[1], aabb.min[2]),
      vec3.fromValues(aabb.max[0], aabb.max[1], aabb.max[2]),
    )
    const radius = diag * 0.5
    const fov = toRad(fovDeg)
    const dist = radius / Math.tan(fov * 0.5) + radius * 0.5
    eye = vec3.fromValues(
      center[0] + dist,
      center[1] + dist * 0.3,
      center[2] + dist,
    )
  }

  const up = vec3.fromValues(0, 1, 0)
  const view = mat4.create()
  mat4.lookAt(view, eye, center, up)

  return { view, proj }
}
