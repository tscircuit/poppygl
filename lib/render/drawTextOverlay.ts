import { glyphLineAlphabet, textMetrics } from "@tscircuit/alphabet"
import type { BitmapLike } from "../image/createUint8Bitmap"
import { drawStrokeText, measureLabelWidth } from "./drawStrokeText"
import type { TextOverlay } from "./getDefaultRenderOptions"

// Common punctuation is absent from the portable alphabet. Supply it only to
// overlay text so existing debug labels retain their exact rasterization.
const OVERLAY_GLYPHS: typeof glyphLineAlphabet = {
  ...glyphLineAlphabet,
  " ": [],
  ":": [
    { x1: 0.3, y1: 0.2, x2: 0.3, y2: 0.2 },
    { x1: 0.3, y1: 0.55, x2: 0.3, y2: 0.55 },
  ],
  ";": [
    { x1: 0.3, y1: 0.55, x2: 0.3, y2: 0.55 },
    { x1: 0.3, y1: 0.2, x2: 0.2, y2: 0.05 },
  ],
  "?": [
    { x1: 0.08, y1: 0.65, x2: 0.25, y2: 0.75 },
    { x1: 0.25, y1: 0.75, x2: 0.5, y2: 0.65 },
    { x1: 0.5, y1: 0.65, x2: 0.5, y2: 0.5 },
    { x1: 0.5, y1: 0.5, x2: 0.3, y2: 0.35 },
    { x1: 0.3, y1: 0.35, x2: 0.3, y2: 0.25 },
    { x1: 0.3, y1: 0.08, x2: 0.3, y2: 0.08 },
  ],
}
const FONT_SIZE = 20
const LINE_HEIGHT = 26
const PADDING = 14
const TEXT_COLOR = [248, 250, 252, 255] as const
const BACKGROUND_COLOR = [35, 42, 52, 255] as const

/** Preserve characters absent from the portable font as visible Unicode
 * escapes; source messages in scene metadata remain untouched. */
function supportedText(text: string): string {
  return Array.from(text.replace(/\r\n?/g, "\n"))
    .map((character) =>
      character === " " || character === "\n" || OVERLAY_GLYPHS[character]
        ? character
        : `[U+${character.codePointAt(0)!.toString(16).toUpperCase()}]`,
    )
    .join("")
}

function wrapText(text: string, width: number): string[] {
  return supportedText(text)
    .split("\n")
    .flatMap((paragraph) => {
      const lines: string[] = []
      let remaining = paragraph
      while (measureLabelWidth(remaining, FONT_SIZE, OVERLAY_GLYPHS) > width) {
        let end = 1
        while (
          end < remaining.length &&
          measureLabelWidth(
            remaining.slice(0, end + 1),
            FONT_SIZE,
            OVERLAY_GLYPHS,
          ) <= width
        )
          end++
        const space = remaining.lastIndexOf(" ", end)
        const split = space > 0 ? space : end
        lines.push(remaining.slice(0, split))
        remaining = remaining.slice(split).replace(/^ /, "")
      }
      lines.push(remaining)
      return lines
    })
}

/** Paint a fixed bottom panel directly into final output pixels. It never
 * participates in 3D depth, transforms, camera fitting, or supersampling. */
export function drawTextOverlay(bitmap: BitmapLike, overlay: TextOverlay) {
  if (!overlay.messages.length && !overlay.title) return
  const contentWidth = Math.max(bitmap.width - PADDING * 2, FONT_SIZE)
  const allLines = [
    ...(overlay.title ? wrapText(overlay.title, contentWidth) : []),
    ...overlay.messages.flatMap((message) => wrapText(message, contentWidth)),
  ]
  const maxLines = Math.max(
    1,
    Math.floor((bitmap.height - PADDING * 2) / LINE_HEIGHT),
  )
  const lines =
    allLines.length > maxLines
      ? [
          ...allLines.slice(0, maxLines - 1),
          `${allLines.length - maxLines + 1} more lines`,
        ]
      : allLines
  const panelHeight = Math.min(
    bitmap.height,
    PADDING * 2 + lines.length * LINE_HEIGHT,
  )
  const top = bitmap.height - panelHeight
  const setPixel = (
    x: number,
    y: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ) => {
    if (x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height) return
    const index = (y * bitmap.width + x) * 4
    bitmap.data[index] = r
    bitmap.data[index + 1] = g
    bitmap.data[index + 2] = b
    bitmap.data[index + 3] = a
  }
  for (let y = top; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) setPixel(x, y, ...BACKGROUND_COLOR)
  }
  lines.forEach((line, index) => {
    drawStrokeText(
      { setPixel },
      line,
      PADDING,
      top + PADDING + index * LINE_HEIGHT,
      FONT_SIZE,
      FONT_SIZE,
      TEXT_COLOR,
      Math.max(2, Math.round(FONT_SIZE * textMetrics.strokeWidthRatio)),
      OVERLAY_GLYPHS,
    )
  })
}
