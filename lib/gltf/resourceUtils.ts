import { decode } from "fast-png"
import type { BitmapLike } from "../image/createUint8Bitmap"
import { base64ToUint8Array } from "../utils/bytes"

export function bufferFromDataURI(uri: string): Uint8Array {
  const match = uri.match(/^data:.*?;base64,(.*)$/)
  if (!match) throw new Error(`Unsupported data URI: ${uri.slice(0, 64)}...`)
  return base64ToUint8Array(match[1]!)
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

async function decodeImageViaFastPng(buf: Uint8Array): Promise<BitmapLike> {
  const decoded = decode(buf)
  return {
    width: decoded.width,
    height: decoded.height,
    data: new Uint8ClampedArray(decoded.data),
  }
}

async function decodeImageViaPureImage(
  buf: Uint8Array,
  mimeType: string,
): Promise<BitmapLike> {
  const { PassThrough } = await import("readable-stream")
  const PImage = await import("pureimage")
  const stream = new PassThrough()
  ;(stream.end as (chunk: Uint8Array) => void)(buf)
  if (mimeType === "image/png") return PImage.decodePNGFromStream(stream as any)
  if (mimeType === "image/jpeg" || mimeType === "image/jpg")
    return PImage.decodeJPEGFromStream(stream as any)
  throw new Error(`Unsupported embedded image mimeType: ${mimeType}`)
}

export async function decodeImageFromBuffer(
  buf: Uint8Array,
  mimeType?: string | null,
): Promise<BitmapLike> {
  const type = detectMimeTypeFromBuffer(buf, mimeType)
  if (!type) {
    throw new Error(
      `Unsupported embedded image mimeType: ${mimeType ?? "unknown"}`,
    )
  }
  if (type === "image/png") {
    return decodeImageViaFastPng(buf)
  }
  return decodeImageViaPureImage(buf, type)
}
