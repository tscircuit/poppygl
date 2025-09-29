import { PassThrough } from "readable-stream"
import * as PImage from "pureimage"
import type { BitmapLike } from "./createUint8Bitmap"

export async function encodePNGToBuffer(image: BitmapLike): Promise<Buffer> {
  const passThrough = new PassThrough()
  const chunks: Buffer[] = []
  passThrough.on("data", (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  })
  const resultPromise = new Promise<Buffer>((resolve, reject) => {
    passThrough.on("end", () => resolve(Buffer.concat(chunks)))
    passThrough.on("error", reject)
  })
  await PImage.encodePNGToStream(image as any, passThrough as any)
  return await resultPromise
}
