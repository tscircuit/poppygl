import { renderDrawCalls } from "./render/renderDrawCalls"

export { renderDrawCalls } from "./render/renderDrawCalls"
export { resolveRenderOptions } from "./render/resolveRenderOptions"
export type { RenderResult } from "./render/renderDrawCalls"

export { createGrid } from "./gltf/createGrid"
export { createInfiniteGrid } from "./gltf/createInfiniteGrid"
export { createSceneFromGLTF } from "./gltf/createSceneFromGLTF"
export { computeSmoothNormals } from "./gltf/computeSmoothNormals"
export { computeWorldAABB } from "./gltf/computeWorldAABB"
export type {
  DrawCall,
  Material,
  GLTFResources,
  GLTFScene,
  GridOptions,
} from "./gltf/types"
export {
  loadGLTFWithResourcesFromURL,
  type LoadGLTFWithResourcesFromURLOptions,
  type FetchLike,
} from "./gltf/loadGLTFWithResourcesFromURL"
export {
  bufferFromDataURI,
  decodeImageFromBuffer,
  isJPG,
  isPNG,
} from "./gltf/resourceUtils"

export { buildCamera } from "./camera/buildCamera"
export type { Camera } from "./camera/buildCamera"

export { SoftwareRenderer } from "./render/SoftwareRenderer"
export type { LightSettings } from "./render/SoftwareRenderer"
export { drawInfiniteGrid } from "./render/drawInfiniteGrid"

export { createUint8Bitmap } from "./image/createUint8Bitmap"
export type {
  BitmapLike,
  ImageFactory,
  MutableRGBA,
  RGBA,
} from "./image/createUint8Bitmap"
export { pureImageFactory } from "./image/pureImageFactory"
export { encodePNGToBuffer } from "./image/encodePNGToBuffer"

export {
  DEFAULT_LIGHT_DIR,
  DEFAULT_RENDER_OPTIONS,
  getDefaultRenderOptions,
  hexToRgb,
} from "./render/getDefaultRenderOptions"
export type {
  RenderOptions,
  RenderOptionsInput,
} from "./render/getDefaultRenderOptions"
export {
  renderGLTFToPNGBufferFromURL,
  type RenderGLTFToPNGBufferFromURLOptions,
} from "./render/renderGLTFToPNGBufferFromURL"
export {
  renderGLTFToPNGBufferFromGLBBuffer,
  type RenderGLTFToPNGBufferFromGLBBufferOptions,
} from "./render/renderGLTFToPNGBufferFromGLBBuffer"
export { renderGLTFToPNGBuffer } from "../cli/renderGLTFToPNGBuffer"

export function renderSceneFromGLTF(
  scene: import("./gltf/types").GLTFScene,
  options?: import("./render/getDefaultRenderOptions").RenderOptionsInput,
  imageFactory?: import("./image/createUint8Bitmap").ImageFactory,
) {
  return renderDrawCalls(scene.drawCalls, options, imageFactory)
}
