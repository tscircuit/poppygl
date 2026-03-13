import { glyphAdvanceRatio, glyphLineAlphabet, textMetrics } from "@tscircuit/alphabet"
import { mat4, vec4 } from "gl-matrix"
import type { Camera } from "../camera/buildCamera"
import type { DebugPoint } from "./getDefaultRenderOptions"
import { SoftwareRenderer } from "./SoftwareRenderer"

const DEFAULT_MARKER_COLOR: readonly [number, number, number, number] = [
  255,
  0,
  170,
  255,
]
const DEFAULT_TEXT_COLOR: readonly [number, number, number, number] = [
  255,
  24,
  170,
  255,
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
      : Math.max(12, Math.round(Math.min(renderer.width, renderer.height) * 0.028))
  const textThickness = Math.max(
    2,
    Math.round(labelScale * textMetrics.strokeWidthRatio),
  )

  for (const debugPoint of debugPoints) {
    const projected = projectWorldToScreen(debugPoint.position, viewProj, renderer)
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
    renderer.setPixel(centerX + offset, centerY, color[0], color[1], color[2], color[3])
    renderer.setPixel(centerX, centerY + offset, color[0], color[1], color[2], color[3])
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

function drawStrokeText(
  renderer: SoftwareRenderer,
  text: string,
  x: number,
  y: number,
  scaleX: number,
  scaleY: number,
  color: readonly [number, number, number, number],
  thickness: number,
) {
  let cursorX = x
  for (const rawChar of text) {
    const char = resolveGlyph(rawChar)
    const glyph = glyphLineAlphabet[char]
    const advanceRatio =
      glyphAdvanceRatio[char] ??
      (char === " " ? textMetrics.spaceWidthRatio : textMetrics.glyphWidthRatio)

    if (glyph) {
      for (const segment of glyph) {
        drawLine(
          renderer,
          cursorX + segment.x1 * scaleX,
          y + (1 - segment.y1) * scaleY,
          cursorX + segment.x2 * scaleX,
          y + (1 - segment.y2) * scaleY,
          color,
          thickness,
        )
      }
    }

    cursorX += advanceRatio * scaleX
  }
}

function resolveGlyph(char: string) {
  if (glyphLineAlphabet[char]) return char
  const uppercase = char.toUpperCase()
  if (glyphLineAlphabet[uppercase]) return uppercase
  return "?"
}

function measureLabelWidth(text: string, scaleX: number) {
  let width = 0
  for (const rawChar of text) {
    const char = resolveGlyph(rawChar)
    width +=
      glyphAdvanceRatio[char] ??
      (char === " " ? textMetrics.spaceWidthRatio : textMetrics.glyphWidthRatio)
  }
  return width * scaleX
}

function drawLine(
  renderer: SoftwareRenderer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: readonly [number, number, number, number],
  thickness: number,
) {
  const dx = x1 - x0
  const dy = y1 - y0
  const steps = Math.max(Math.abs(dx), Math.abs(dy))

  if (steps === 0) {
    drawBrush(renderer, x0, y0, color, thickness)
    return
  }

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    drawBrush(renderer, x0 + dx * t, y0 + dy * t, color, thickness)
  }
}

function drawBrush(
  renderer: SoftwareRenderer,
  x: number,
  y: number,
  color: readonly [number, number, number, number],
  thickness: number,
) {
  const radius = Math.max(0, Math.floor((thickness - 1) / 2))
  const centerX = Math.round(x)
  const centerY = Math.round(y)

  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      renderer.setPixel(
        centerX + offsetX,
        centerY + offsetY,
        color[0],
        color[1],
        color[2],
        color[3],
      )
    }
  }
}

function toColorRGBA(
  color: readonly [number, number, number] | null | undefined,
  fallback: readonly [number, number, number, number],
): readonly [number, number, number, number] {
  if (!color) return fallback
  return [color[0], color[1], color[2], 255]
}
