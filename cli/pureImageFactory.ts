import PImage from "pureimage"
import type { BitmapLike, ImageFactory } from "../lib/image/createUint8Bitmap"

export const pureImageFactory: ImageFactory = (width, height) =>
  PImage.make(width, height) as BitmapLike
