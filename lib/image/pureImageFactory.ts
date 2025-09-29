import * as PImage from "pureimage"
import type { BitmapLike, ImageFactory } from "./createUint8Bitmap"

export const pureImageFactory: ImageFactory = (width, height) =>
  PImage.make(width, height) as BitmapLike
