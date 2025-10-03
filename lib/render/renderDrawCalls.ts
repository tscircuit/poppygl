import { buildCamera, type Camera } from "../camera/buildCamera"
import type { DrawCall } from "../gltf/types"
import type { BitmapLike, ImageFactory } from "../image/createUint8Bitmap"
import { createUint8Bitmap } from "../image/createUint8Bitmap"
import {
  type RenderOptions,
  type RenderOptionsInput,
} from "./getDefaultRenderOptions"
import { SoftwareRenderer } from "./SoftwareRenderer"
import { resolveRenderOptions } from "./resolveRenderOptions"

export interface RenderResult {
  bitmap: BitmapLike
  camera: Camera
  options: RenderOptions
}

export function renderDrawCalls(
  drawCalls: DrawCall[],
  optionsInput: RenderOptionsInput = {},
  imageFactory: ImageFactory = createUint8Bitmap,
): RenderResult {
  const options = resolveRenderOptions(optionsInput)
  const camera = buildCamera(
    drawCalls,
    options.width,
    options.height,
    options.fov,
    options.camPos ?? null,
    options.lookAt ?? null,
  )

  const renderer = new SoftwareRenderer(
    options.width,
    options.height,
    imageFactory,
  )

  // Clear with background color (transparent by default)
  if (options.backgroundColor) {
    const [r, g, b] = options.backgroundColor
    renderer.clear([
      Math.round(r * 255),
      Math.round(g * 255),
      Math.round(b * 255),
      255,
    ])
  } else {
    // Transparent background
    renderer.clear([0, 0, 0, 0])
  }

  for (const dc of drawCalls) {
    renderer.drawMesh(
      dc,
      camera,
      { dir: options.lightDir, ambient: options.ambient },
      dc.material,
      options.cull,
      options.gamma,
    )
  }

  return { bitmap: renderer.bitmap, camera, options }
}
