import { buildCamera, type Camera } from "../camera/buildCamera"
import { computeWorldAABB } from "../gltf/computeWorldAABB"
import { createGrid } from "../gltf/createGrid"
import type { DrawCall, GridOptions } from "../gltf/types"
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

  const allDrawCalls = [...drawCalls]
  if (options.grid) {
    const userGridOptions =
      typeof options.grid === "boolean" ? {} : options.grid

    const aabb = computeWorldAABB(drawCalls)
    const sizeX = aabb.max[0]! - aabb.min[0]!
    const sizeZ = aabb.max[2]! - aabb.min[2]!
    const maxSize = Math.max(sizeX, sizeZ)

    const defaultSize = Math.ceil((maxSize * 1.2) / 2) * 2
    const defaultY = aabb.min[1]!
    const defaultCenter: [number, number, number] = [
      (aabb.min[0]! + aabb.max[0]!) / 2,
      0, // y-component is not used for grid center, y is separate
      (aabb.min[2]! + aabb.max[2]!) / 2,
    ]

    const finalGridOptions: GridOptions = {
      size: defaultSize > 0 ? defaultSize : 10,
      y: defaultY,
      center: defaultCenter,
      ...userGridOptions,
    }
    allDrawCalls.push(createGrid(finalGridOptions))
  }

  for (const dc of allDrawCalls) {
    if (dc.mode === 1) {
      renderer.drawLines(dc, camera, options.gamma)
    } else {
      renderer.drawMesh(
        dc,
        camera,
        { dir: options.lightDir, ambient: options.ambient },
        dc.material,
        options.cull,
        options.gamma,
      )
    }
  }

  return { bitmap: renderer.bitmap, camera, options }
}
