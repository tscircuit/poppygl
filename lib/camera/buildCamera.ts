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

function buildCameraWorldMatrix(
  eye: vec3,
  forward: vec3,
  up: vec3,
): mat4 | null {
  const normalizedForward = vec3.normalize(vec3.create(), forward)
  const right = vec3.cross(vec3.create(), normalizedForward, up)
  if (vec3.squaredLength(right) === 0) {
    return null
  }
  vec3.normalize(right, right)

  const correctedUp = vec3.cross(vec3.create(), right, normalizedForward)
  if (vec3.squaredLength(correctedUp) === 0) {
    return null
  }
  vec3.normalize(correctedUp, correctedUp)

  return mat4.fromValues(
    right[0],
    right[1],
    right[2],
    0,
    correctedUp[0],
    correctedUp[1],
    correctedUp[2],
    0,
    -normalizedForward[0],
    -normalizedForward[1],
    -normalizedForward[2],
    0,
    eye[0],
    eye[1],
    eye[2],
    1,
  )
}

function getDefaultForwardForUp(up: vec3): vec3 {
  const zForward = vec3.fromValues(0, 0, -1)
  if (Math.abs(vec3.dot(up, zForward)) < 0.999) {
    return zForward
  }
  return vec3.fromValues(1, 0, 0)
}

function buildViewFromRotation(
  eye: vec3,
  up: vec3,
  rotation: CameraRotation,
): mat4 {
  const cameraWorld = buildCameraWorldMatrix(
    eye,
    getDefaultForwardForUp(up),
    up,
  )
  if (!cameraWorld) {
    return mat4.create()
  }

  if (rotation.x !== 0) {
    mat4.rotateX(cameraWorld, cameraWorld, toRad(rotation.x))
  }
  if (rotation.y !== 0) {
    mat4.rotateY(cameraWorld, cameraWorld, toRad(rotation.y))
  }
  if (rotation.z !== 0) {
    mat4.rotateZ(cameraWorld, cameraWorld, toRad(rotation.z))
  }

  const view = mat4.create()
  mat4.invert(view, cameraWorld)
  return view
}

function buildViewFromLookAt(eye: vec3, center: vec3, up: vec3): mat4 {
  const forward = vec3.subtract(vec3.create(), center, eye)
  if (vec3.squaredLength(forward) === 0) {
    return mat4.create()
  }

  const cameraWorld = buildCameraWorldMatrix(eye, forward, up)
  if (!cameraWorld) {
    return mat4.create()
  }

  const view = mat4.create()
  mat4.invert(view, cameraWorld)
  return view
}

function getAutoDistance(drawCalls: DrawCall[], fovDeg: number) {
  const aabb = computeWorldAABB(drawCalls)
  const diag = vec3.distance(
    vec3.fromValues(aabb.min[0]!, aabb.min[1]!, aabb.min[2]!),
    vec3.fromValues(aabb.max[0]!, aabb.max[1]!, aabb.max[2]!),
  )
  const radius = diag * 0.5
  const fov = toRad(fovDeg)
  return radius / Math.tan(fov * 0.5) + radius * 0.5
}

function getAABBCornerDistances(
  aabb: ReturnType<typeof computeWorldAABB>,
  eye: vec3,
) {
  const xs = [aabb.min[0]!, aabb.max[0]!]
  const ys = [aabb.min[1]!, aabb.max[1]!]
  const zs = [aabb.min[2]!, aabb.max[2]!]

  let nearest = Infinity
  let farthest = 0

  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        const distance = vec3.distance(eye, vec3.fromValues(x, y, z))
        nearest = Math.min(nearest, distance)
        farthest = Math.max(farthest, distance)
      }
    }
  }

  return { nearest, farthest }
}

function getCameraForwardFromView(view: mat4): vec3 {
  const cameraWorld = mat4.create()
  mat4.invert(cameraWorld, view)
  return vec3.fromValues(-cameraWorld[8]!, -cameraWorld[9]!, -cameraWorld[10]!)
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
  const worldUp = getWorldUpVector(up)

  const aabb = computeWorldAABB(drawCalls)
  const center = vec3.fromValues(
    0.5 * (aabb.min[0]! + aabb.max[0]!),
    0.5 * (aabb.min[1]! + aabb.max[1]!),
    0.5 * (aabb.min[2]! + aabb.max[2]!),
  )
  const autoDistance = getAutoDistance(drawCalls, fovDeg)

  if (cameraRotation) {
    const provisionalEye = camPos
      ? vec3.fromValues(camPos[0]!, camPos[1]!, camPos[2]!)
      : vec3.clone(center)
    const provisionalView = buildViewFromRotation(
      provisionalEye,
      worldUp,
      cameraRotation,
    )

    const eye = camPos
      ? provisionalEye
      : vec3.scaleAndAdd(
          vec3.create(),
          center,
          getCameraForwardFromView(provisionalView),
          -autoDistance,
        )

    const { nearest, farthest } = getAABBCornerDistances(aabb, eye)
    const near = Math.max(0.01, nearest * 0.5)
    const far = Math.max(1000, farthest * 1.1)
    const proj = mat4.create()
    mat4.perspective(proj, toRad(fovDeg), aspect, near, far)

    return {
      view: buildViewFromRotation(eye, worldUp, cameraRotation),
      proj,
    }
  }

  const eye = camPos
    ? vec3.fromValues(camPos[0]!, camPos[1]!, camPos[2]!)
    : vec3.fromValues(
        center[0] + autoDistance,
        center[1] + autoDistance * 0.3,
        center[2] + autoDistance,
      )
  const target = lookAt
    ? vec3.fromValues(lookAt[0]!, lookAt[1]!, lookAt[2]!)
    : center

  const { nearest, farthest } = getAABBCornerDistances(aabb, eye)
  const near = Math.max(0.01, nearest * 0.5)
  const far = Math.max(1000, farthest * 1.1)
  const proj = mat4.create()
  mat4.perspective(proj, toRad(fovDeg), aspect, near, far)
  const view = buildViewFromLookAt(eye, target, worldUp)

  return { view, proj }
}
