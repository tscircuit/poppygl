import { textMetrics } from "@tscircuit/alphabet"
import { mat4, vec4 } from "gl-matrix"
import type { Camera } from "../camera/buildCamera"
import type { DebugPoint } from "./getDefaultRenderOptions"
import { SoftwareRenderer } from "./SoftwareRenderer"
import { drawStrokeText, measureLabelWidth } from "./drawStrokeText"

const DEFAULT_MARKER_COLOR: readonly [number, number, number, number] = [
  255, 0, 170, 255,
]
const DEFAULT_TEXT_COLOR: readonly [number, number, number, number] = [
  255, 24, 170, 255,
]
const CHARACTER_WIDTH_RATIO = 0.62

type ScreenPoint = {
  x: number
  y: number
}

export function drawDebugPoints(
  renderer: SoftwareRenderer,
  camera: Camera,
  debugPoints: DebugPoint[],
  debugFontSize: number | null | undefined,
  debugPointColor: readonly [number, number, number] | null | undefined,
  debugLabelColor: readonly [number, number, number] | null | undefined,
) {
  if (debugPoints.length === 0) return

  const viewProj = mat4.create()
  mat4.multiply(viewProj, camera.proj, camera.view)
  const markerColor = toColorRGBA(debugPointColor, DEFAULT_MARKER_COLOR)
  const textColor = toColorRGBA(debugLabelColor, DEFAULT_TEXT_COLOR)

  const labelScale =
    typeof debugFontSize === "number" && Number.isFinite(debugFontSize)
      ? Math.max(1, Math.round(debugFontSize))
      : Math.max(
          12,
          Math.round(Math.min(renderer.width, renderer.height) * 0.028),
        )
  const textThickness = Math.max(
    2,
    Math.round(labelScale * textMetrics.strokeWidthRatio),
  )

  for (const debugPoint of debugPoints) {
    const projected = projectWorldToScreen(
      debugPoint.position,
      viewProj,
      renderer,
    )
    if (!projected) continue

    drawMarker(renderer, projected, markerColor)
    drawLabel(
      renderer,
      projected,
      debugPoint.label,
      textColor,
      labelScale,
      textThickness,
    )
  }
}

function projectWorldToScreen(
  position: DebugPoint["position"],
  viewProj: mat4,
  renderer: SoftwareRenderer,
): ScreenPoint | null {
  const clip = vec4.fromValues(position.x, position.y, position.z, 1)
  vec4.transformMat4(clip, clip, viewProj)

  if (!Number.isFinite(clip[3]) || clip[3] <= 0) return null

  const invW = 1 / clip[3]
  const ndcX = clip[0] * invW
  const ndcY = clip[1] * invW
  const ndcZ = clip[2] * invW

  if (
    !Number.isFinite(ndcX) ||
    !Number.isFinite(ndcY) ||
    !Number.isFinite(ndcZ) ||
    ndcZ < -1 ||
    ndcZ > 1
  ) {
    return null
  }

  return {
    x: (ndcX * 0.5 + 0.5) * (renderer.width - 1),
    y: (1 - (ndcY * 0.5 + 0.5)) * (renderer.height - 1),
  }
}

function drawMarker(
  renderer: SoftwareRenderer,
  projected: ScreenPoint,
  color: readonly [number, number, number, number],
) {
  const centerX = Math.round(projected.x)
  const centerY = Math.round(projected.y)

  for (let offset = -5; offset <= 4; offset += 1) {
    renderer.setPixel(
      centerX + offset,
      centerY,
      color[0],
      color[1],
      color[2],
      color[3],
    )
    renderer.setPixel(
      centerX,
      centerY + offset,
      color[0],
      color[1],
      color[2],
      color[3],
    )
  }
}

function drawLabel(
  renderer: SoftwareRenderer,
  projected: ScreenPoint,
  label: string,
  color: readonly [number, number, number, number],
  scale: number,
  textThickness: number,
) {
  if (label.length === 0) return

  const scaleX = scale * CHARACTER_WIDTH_RATIO
  const labelWidth = measureLabelWidth(label, scaleX)
  let x = projected.x + scale * 0.6
  let y = projected.y - scale * 1.1

  if (x + labelWidth > renderer.width - 2) {
    x = projected.x - scale * 0.6 - labelWidth
  }
  if (y < 2) {
    y = projected.y + scale * 0.2
  }

  drawStrokeText(renderer, label, x, y, scaleX, scale, color, textThickness)
}

function toColorRGBA(
  color: readonly [number, number, number] | null | undefined,
  fallback: readonly [number, number, number, number],
): readonly [number, number, number, number] {
  if (!color) return fallback
  return [color[0], color[1], color[2], 255]
}
