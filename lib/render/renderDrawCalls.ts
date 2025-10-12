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
import { drawInfiniteGrid } from "./drawInfiniteGrid"

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
  let infiniteGridOptions: GridOptions | null = null

  if (options.grid) {
    const userGridOptions =
      typeof options.grid === "boolean" ? {} : options.grid

    // Check if we should use infinite grid
    if (userGridOptions.infiniteGrid) {
      infiniteGridOptions = userGridOptions
    } else {
      // Use regular grid
      const aabb = computeWorldAABB(drawCalls)
      const sizeX = aabb.max[0]! - aabb.min[0]!
      const sizeZ = aabb.max[2]! - aabb.min[2]!
      const maxSize = Math.max(sizeX, sizeZ)

      const defaultSize = Math.ceil((maxSize * 1.2) / 2) * 2

      const defaultOffset = {
        x: (aabb.min[0]! + aabb.max[0]!) / 2,
        y: aabb.min[1]!,
        z: (aabb.min[2]! + aabb.max[2]!) / 2,
      }

      const defaultGridOptions = {
        size: defaultSize > 0 ? defaultSize : 10,
        offset: defaultOffset,
      }

      const finalGridOptions: GridOptions = {
        ...defaultGridOptions,
        ...userGridOptions,
        offset: {
          ...defaultGridOptions.offset,
          ...userGridOptions.offset,
        },
      }
      allDrawCalls.push(createGrid(finalGridOptions))
    }
  }

  // Split draw calls by transparency mode for correct rendering order
  const opaqueDraws = allDrawCalls.filter(
    (dc) => (dc.material.alphaMode ?? "OPAQUE") === "OPAQUE",
  )
  const maskDraws = allDrawCalls.filter(
    (dc) => (dc.material.alphaMode ?? "OPAQUE") === "MASK",
  )
  const blendDraws = allDrawCalls.filter(
    (dc) => (dc.material.alphaMode ?? "OPAQUE") === "BLEND",
  )

  // Helper to render groups
  const renderGroup = (dcs: DrawCall[]) => {
    for (const dc of dcs) {
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
  }

  // Opaque first, then masked, then blended (for correct depth sorting)
  renderGroup(opaqueDraws)
  renderGroup(maskDraws)

  // Render infinite grid AFTER opaque geometry but BEFORE transparent
  // This allows proper depth testing so grid appears through/behind geometry
  if (infiniteGridOptions) {
    // Calculate the Y-center of the model to position the grid plane
    const aabb = computeWorldAABB(drawCalls)
    const modelCenterY = (aabb.min[1]! + aabb.max[1]!) / 2

    // Allow user override via offset.y, otherwise use calculated center
    const gridY = infiniteGridOptions.offset?.y ?? modelCenterY

    drawInfiniteGrid(renderer, {
      camera,
      grid_y: gridY,
      cell_size: infiniteGridOptions.cellSize,
      section_size: infiniteGridOptions.sectionSize,
      fade_distance: infiniteGridOptions.fadeDistance,
      fade_strength: infiniteGridOptions.fadeStrength,
      grid_color: infiniteGridOptions.gridColor,
      section_color: infiniteGridOptions.sectionColor,
      gamma_out: options.gamma,
    })
  }

  renderGroup(blendDraws)

  return { bitmap: renderer.bitmap, camera, options }
}
