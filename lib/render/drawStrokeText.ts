import {
  glyphAdvanceRatio,
  glyphLineAlphabet,
  textMetrics,
} from "@tscircuit/alphabet"
import type { SoftwareRenderer } from "./SoftwareRenderer"

type Glyphs = typeof glyphLineAlphabet

export function drawStrokeText(
  renderer: Pick<SoftwareRenderer, "setPixel">,
  text: string,
  x: number,
  y: number,
  scaleX: number,
  scaleY: number,
  color: readonly [number, number, number, number],
  thickness: number,
  glyphs: Glyphs = glyphLineAlphabet,
) {
  let cursorX = x
  for (const rawChar of text) {
    const char = resolveGlyph(rawChar, glyphs)
    const glyph = glyphs[char]
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

function resolveGlyph(char: string, glyphs: Glyphs) {
  if (glyphs[char]) return char
  const uppercase = char.toUpperCase()
  if (glyphs[uppercase]) return uppercase
  return "?"
}

export function measureLabelWidth(
  text: string,
  scaleX: number,
  glyphs: Glyphs = glyphLineAlphabet,
) {
  let width = 0
  for (const rawChar of text) {
    const char = resolveGlyph(rawChar, glyphs)
    width +=
      glyphAdvanceRatio[char] ??
      (char === " " ? textMetrics.spaceWidthRatio : textMetrics.glyphWidthRatio)
  }
  return width * scaleX
}

function drawLine(
  renderer: Pick<SoftwareRenderer, "setPixel">,
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
  renderer: Pick<SoftwareRenderer, "setPixel">,
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
