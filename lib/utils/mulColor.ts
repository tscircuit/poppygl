import type { MutableRGBA, RGBA } from "../image/createUint8Bitmap"

export function mulColor(a: RGBA, b: RGBA): MutableRGBA {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2], a[3] * b[3]]
}
