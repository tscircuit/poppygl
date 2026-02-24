import type { BitmapLike, ImageFactory } from "../image/createUint8Bitmap"

export function downsampleBitmap(
  source: BitmapLike,
  targetWidth: number,
  targetHeight: number,
  imageFactory: ImageFactory,
): BitmapLike {
  const target = imageFactory(targetWidth, targetHeight)
  const scaleX = source.width / targetWidth
  const scaleY = source.height / targetHeight

  for (let y = 0; y < targetHeight; y++) {
    const srcY0 = Math.floor(y * scaleY)
    const srcY1 = Math.max(
      srcY0 + 1,
      Math.min(source.height, Math.floor((y + 1) * scaleY)),
    )

    for (let x = 0; x < targetWidth; x++) {
      const srcX0 = Math.floor(x * scaleX)
      const srcX1 = Math.max(
        srcX0 + 1,
        Math.min(source.width, Math.floor((x + 1) * scaleX)),
      )

      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let count = 0

      for (let sy = srcY0; sy < srcY1; sy++) {
        for (let sx = srcX0; sx < srcX1; sx++) {
          const srcIdx = (sy * source.width + sx) * 4
          r += source.data[srcIdx + 0]!
          g += source.data[srcIdx + 1]!
          b += source.data[srcIdx + 2]!
          a += source.data[srcIdx + 3]!
          count++
        }
      }

      const dstIdx = (y * targetWidth + x) * 4
      target.data[dstIdx + 0] = Math.round(r / count)
      target.data[dstIdx + 1] = Math.round(g / count)
      target.data[dstIdx + 2] = Math.round(b / count)
      target.data[dstIdx + 3] = Math.round(a / count)
    }
  }

  return target
}
