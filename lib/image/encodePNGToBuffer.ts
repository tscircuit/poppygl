import { PassThrough } from "readable-stream"
import * as PImage from "pureimage"
import {
  concatUint8Arrays,
  toUint8Array,
  uint8ArrayToNodeBuffer,
} from "../utils/bytes"
import type { BitmapLike } from "./createUint8Bitmap"

export async function encodePNGToBuffer(image: BitmapLike): Promise<Buffer> {
  const passThrough = new PassThrough()
  const chunks: Uint8Array[] = []
  passThrough.on(
    "data",
    (chunk: Uint8Array | ArrayBuffer | ArrayBufferView) => {
      chunks.push(toUint8Array(chunk))
    },
  )
  const resultPromise = new Promise<Buffer>((resolve, reject) => {
    passThrough.on("end", () => {
      resolve(uint8ArrayToNodeBuffer(concatUint8Arrays(chunks)))
    })
    passThrough.on("error", reject)
  })
  await PImage.encodePNGToStream(image as any, passThrough as any)
  return await resultPromise
}
