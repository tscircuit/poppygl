import type { BitmapLike } from "./createUint8Bitmap"

async function encodePNGViaCanvas(image: BitmapLike): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(image.width, image.height)
  const ctx = canvas.getContext("2d")!
  const imageData = new ImageData(
    new Uint8ClampedArray(
      image.data.buffer,
      image.data.byteOffset,
      image.data.byteLength,
    ),
    image.width,
    image.height,
  )
  ctx.putImageData(imageData, 0, 0)
  const blob = await canvas.convertToBlob({ type: "image/png" })
  const buffer = await blob.arrayBuffer()
  return new Uint8Array(buffer)
}

async function encodePNGViaPureImage(image: BitmapLike): Promise<Uint8Array> {
  const { PassThrough } = await import("readable-stream")
  const PImage = await import("pureimage")
  const passThrough = new PassThrough()
  const chunks: Uint8Array[] = []

  passThrough.on("data", (chunk: any) => {
    chunks.push(chunk instanceof Uint8Array ? chunk : Uint8Array.from(chunk))
  })

  const resultPromise = new Promise<Uint8Array>((resolve, reject) => {
    passThrough.on("end", () => {
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const png = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        png.set(chunk, offset)
        offset += chunk.length
      }
      resolve(png)
    })
    passThrough.on("error", reject)
  })

  await PImage.encodePNGToStream(image as any, passThrough as any)
  return await resultPromise
}

export async function encodePNG(image: BitmapLike): Promise<Uint8Array> {
  if (typeof OffscreenCanvas !== "undefined") {
    return encodePNGViaCanvas(image)
  }
  return encodePNGViaPureImage(image)
}
