import { glyphAdvanceRatio, glyphLineAlphabet } from "@tscircuit/alphabet"
import {
  createUint8Bitmap,
  type BitmapLike,
} from "../../lib/image/createUint8Bitmap"

// Deterministic vector lettering: no platform fonts or browser needed in CI.
export function annotateClipping(
  bitmap: BitmapLike,
  title: string,
  subtitle: string,
  panelScene = false,
): BitmapLike {
  const output = createUint8Bitmap(bitmap.width, bitmap.height + 136)
  output.data.fill(255)
  const pixel = (x: number, y: number, color = [25, 35, 50, 255]) => {
    x = Math.round(x)
    y = Math.round(y)
    if (x >= 0 && x < output.width && y >= 0 && y < output.height)
      output.data.set(color, (y * output.width + x) * 4)
  }
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)))
    for (let i = 0; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps,
        y = y0 + ((y1 - y0) * i) / steps
      pixel(x, y)
      pixel(x + 1, y)
    }
  }
  const text = (value: string, x: number, y: number, size = 16) => {
    for (const c of value.toUpperCase()) {
      for (const s of glyphLineAlphabet[c] ?? [])
        line(
          x + s.x1 * size,
          y + (1 - s.y1) * size,
          x + s.x2 * size,
          y + (1 - s.y2) * size,
        )
      x += (glyphAdvanceRatio[c] ?? 0.7) * size
    }
  }
  text(title, 16, 14, 22)
  text(subtitle, 16, 49, 13)
  for (let y = 0; y < bitmap.height; y++) {
    output.data.set(
      bitmap.data.subarray(y * bitmap.width * 4, (y + 1) * bitmap.width * 4),
      (y + 80) * output.width * 4,
    )
  }
  if (panelScene) {
    text("PCB MUST STAY GREEN", 18, 80 + bitmap.height * 0.59, 15)
    line(
      210,
      80 + bitmap.height * 0.6,
      bitmap.width * 0.5,
      80 + bitmap.height * 0.44,
    )
    text("BLUE = VISIBLE DISPLAY", 18, 80 + bitmap.height * 0.81, 15)
    line(230, 80 + bitmap.height * 0.83, 260, 80 + bitmap.height * 0.94)
  }
  text(
    panelScene ? "GREEN PCB / BLUE DISPLAY" : "ONLY RENDER PIXELS COMPARED",
    16,
    output.height - 36,
    13,
  )
  return output
}

export function clippingComparison(
  expected: BitmapLike,
  actual: BitmapLike,
): BitmapLike {
  const diff = createUint8Bitmap(actual.width, actual.height)
  for (let i = 0; i < diff.data.length; i += 4) {
    const changed = [0, 1, 2, 3].some(
      (c) => Math.abs(actual.data[i + c]! - expected.data[i + c]!) > 2,
    )
    diff.data.set(changed ? [255, 0, 150, 255] : [240, 243, 247, 255], i)
  }
  const panels = [
    annotateClipping(
      expected,
      "EXPECTED",
      "DISPLAY CLIPPED BY HAND AT NEAR PLANE",
      true,
    ),
    annotateClipping(
      actual,
      "ACTUAL RENDER",
      "DISPLAY EXTENDS BEHIND THE CAMERA",
      true,
    ),
    annotateClipping(
      diff,
      "PIXEL DIFFERENCE",
      "MAGENTA = WRONG PIXELS / BLANK = MATCH",
    ),
  ]
  const result = createUint8Bitmap(actual.width * 3, panels[0]!.height)
  for (let p = 0; p < panels.length; p++) {
    const panel = panels[p]!
    for (let y = 0; y < panel.height; y++)
      result.data.set(
        panel.data.subarray(y * panel.width * 4, (y + 1) * panel.width * 4),
        (y * result.width + p * panel.width) * 4,
      )
  }
  return result
}
