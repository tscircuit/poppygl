import { PassThrough } from "readable-stream"
import * as PImage from "pureimage"
import type { BitmapLike } from "../image/createUint8Bitmap"

export function bufferFromDataURI(uri: string): Uint8Array {
  const match = uri.match(/^data:.*?;base64,(.*)$/)
  if (!match) throw new Error(`Unsupported data URI: ${uri.slice(0, 64)}...`)
  return Buffer.from(match[1]!, "base64")
}

export function isPNG(filenameOrUri: string) {
  return /\.png(\?|$)/i.test(filenameOrUri) || /image\/png/i.test(filenameOrUri)
}

export function isJPG(filenameOrUri: string) {
  return /(\.jpe?g(\?|$)|image\/jpe?g)/i.test(filenameOrUri)
}

export function detectMimeTypeFromBuffer(
  buf: Uint8Array,
  hint?: string | null,
) {
  if (hint) return hint
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  )
    return "image/png"
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg"
  return null
}

export function bufferToStream(buf: Uint8Array) {
  const stream = new PassThrough()
  stream.end(Buffer.from(buf))
  return stream
}

export async function decodeImageFromBuffer(
  buf: Uint8Array,
  mimeType?: string | null,
): Promise<BitmapLike> {
  const type = detectMimeTypeFromBuffer(buf, mimeType)
  if (type === "image/png")
    return PImage.decodePNGFromStream(bufferToStream(buf))
  if (type === "image/jpeg" || type === "image/jpg")
    return PImage.decodeJPEGFromStream(bufferToStream(buf))
  throw new Error(
    `Unsupported embedded image mimeType: ${mimeType ?? "unknown"}`,
  )
}
