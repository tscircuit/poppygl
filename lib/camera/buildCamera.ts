import { mat4, vec3 } from "gl-matrix"
import type { DrawCall } from "../gltf/types"
import { computeWorldAABB } from "../gltf/computeWorldAABB"
import { toRad } from "../utils/toRad"
import type {
  CameraRotation,
  CameraUp,
} from "../render/getDefaultRenderOptions"

export interface Camera {
  view: mat4
  proj: mat4
}

function getWorldUpVector(up: CameraUp | null | undefined): vec3 {
  switch (up) {
    case "y-":
      return vec3.fromValues(0, -1, 0)
    case "x+":
      return vec3.fromValues(1, 0, 0)
    case "x-":
      return vec3.fromValues(-1, 0, 0)
    case "z+":
      return vec3.fromValues(0, 0, 1)
    case "z-":
      return vec3.fromValues(0, 0, -1)
    case "y+":
    default:
      return vec3.fromValues(0, 1, 0)
  }
}

function applyCameraRotation(
  eye: vec3,
  center: vec3,
  up: vec3,
  rotation: CameraRotation | null | undefined,
): mat4 {
  const view = mat4.create()
  mat4.lookAt(view, eye, center, up)

  if (rotation == null) {
    return view
  }

  const forward = vec3.subtract(vec3.create(), center, eye)
  if (vec3.squaredLength(forward) === 0) {
    return view
  }
  vec3.normalize(forward, forward)

  const right = vec3.cross(vec3.create(), forward, up)
  if (vec3.squaredLength(right) === 0) {
    return view
  }
  vec3.normalize(right, right)

  const correctedUp = vec3.cross(vec3.create(), right, forward)
  if (vec3.squaredLength(correctedUp) === 0) {
    return view
  }
  vec3.normalize(correctedUp, correctedUp)

  const cameraWorld = mat4.fromValues(
    right[0],
    right[1],
    right[2],
    0,
    correctedUp[0],
    correctedUp[1],
    correctedUp[2],
    0,
    -forward[0],
    -forward[1],
    -forward[2],
    0,
    eye[0],
    eye[1],
    eye[2],
    1,
  )

  if (rotation.x !== 0) {
    mat4.rotateX(cameraWorld, cameraWorld, toRad(rotation.x))
  }
  if (rotation.y !== 0) {
    mat4.rotateY(cameraWorld, cameraWorld, toRad(rotation.y))
  }
  if (rotation.z !== 0) {
    mat4.rotateZ(cameraWorld, cameraWorld, toRad(rotation.z))
  }

  const rotatedView = mat4.create()
  mat4.invert(rotatedView, cameraWorld)
  return rotatedView
}

export function buildCamera(
  drawCalls: DrawCall[],
  width: number,
  height: number,
  fovDeg: number,
  camPos: readonly [number, number, number] | null | undefined,
  lookAt: readonly [number, number, number] | null | undefined,
  up: CameraUp | null | undefined = "y+",
  cameraRotation: CameraRotation | null | undefined = null,
): Camera {
  const aspect = width / height
  const near = 0.01
  const far = 1000.0
  const proj = mat4.create()
  mat4.perspective(proj, toRad(fovDeg), aspect, near, far)

  let eye: vec3
  let center: vec3

  if (camPos) {
    eye = vec3.fromValues(camPos[0]!, camPos[1]!, camPos[2]!)
    if (lookAt) {
      center = vec3.fromValues(lookAt[0]!, lookAt[1]!, lookAt[2]!)
    } else {
      const aabb = computeWorldAABB(drawCalls)
      center = vec3.fromValues(
        0.5 * (aabb.min[0]! + aabb.max[0]!),
        0.5 * (aabb.min[1]! + aabb.max[1]!),
        0.5 * (aabb.min[2]! + aabb.max[2]!),
      )
    }
  } else {
    const aabb = computeWorldAABB(drawCalls)
    center = vec3.fromValues(
      0.5 * (aabb.min[0]! + aabb.max[0]!),
      0.5 * (aabb.min[1]! + aabb.max[1]!),
      0.5 * (aabb.min[2]! + aabb.max[2]!),
    )
    const diag = vec3.distance(
      vec3.fromValues(aabb.min[0]!, aabb.min[1]!, aabb.min[2]!),
      vec3.fromValues(aabb.max[0]!, aabb.max[1]!, aabb.max[2]!),
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

  const view = applyCameraRotation(
    eye,
    center,
    getWorldUpVector(up),
    cameraRotation,
  )

  return { view, proj }
}
