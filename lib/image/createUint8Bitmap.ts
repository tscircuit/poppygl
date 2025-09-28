export type RGBA = readonly [number, number, number, number]
export type MutableRGBA = [number, number, number, number]

export interface BitmapLike {
  width: number
  height: number
  data: Uint8Array | Uint8ClampedArray
}

export type ImageFactory = (width: number, height: number) => BitmapLike

export const createUint8Bitmap: ImageFactory = (width, height) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
})
