import {
  DEFAULT_RENDER_OPTIONS,
  type CameraRotation,
  type CameraUp,
  type RenderOptions,
  type RenderOptionsInput,
} from "./getDefaultRenderOptions"

const CAMERA_UP_VALUES = new Set<CameraUp>([
  "y+",
  "y-",
  "x+",
  "x-",
  "z+",
  "z-",
])

function resolveCameraUp(up: RenderOptionsInput["up"]): CameraUp {
  return up != null && CAMERA_UP_VALUES.has(up)
    ? up
    : DEFAULT_RENDER_OPTIONS.up
}

function resolveCameraRotation(
  cameraRotation: RenderOptionsInput["cameraRotation"],
): CameraRotation | null {
  if (cameraRotation == null) {
    return DEFAULT_RENDER_OPTIONS.cameraRotation
  }

  const resolveAxis = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : 0

  return {
    x: resolveAxis(cameraRotation.x),
    y: resolveAxis(cameraRotation.y),
    z: resolveAxis(cameraRotation.z),
  }
}

export function resolveRenderOptions(
  options: RenderOptionsInput = {},
): RenderOptions {
  const supersampling =
    typeof options.supersampling === "number" &&
    Number.isFinite(options.supersampling)
      ? Math.max(1, Math.floor(options.supersampling))
      : DEFAULT_RENDER_OPTIONS.supersampling

  return {
    ...DEFAULT_RENDER_OPTIONS,
    ...options,
    supersampling,
    lightDir:
      options.lightDir != null
        ? (options.lightDir as RenderOptions["lightDir"])
        : DEFAULT_RENDER_OPTIONS.lightDir,
    camPos:
      options.camPos !== undefined
        ? (options.camPos as RenderOptions["camPos"])
        : DEFAULT_RENDER_OPTIONS.camPos,
    lookAt:
      options.lookAt !== undefined
        ? (options.lookAt as RenderOptions["lookAt"])
        : DEFAULT_RENDER_OPTIONS.lookAt,
    up: resolveCameraUp(options.up),
    cameraRotation: resolveCameraRotation(options.cameraRotation),
  }
}
