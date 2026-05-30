import { encode } from "fast-png"
import type { BitmapLike } from "./createUint8Bitmap"

export async function encodePNG(image: BitmapLike): Promise<Uint8Array> {
  return encode({
    width: image.width,
    height: image.height,
    data: image.data,
    channels: 4,
    depth: 8,
  })
}
