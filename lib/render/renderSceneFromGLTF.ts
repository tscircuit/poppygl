import type { GLTFScene } from "../gltf/types"
import type { ImageFactory } from "../image/createUint8Bitmap"
import type { RenderOptionsInput, TextOverlay } from "./getDefaultRenderOptions"
import { renderDrawCalls } from "./renderDrawCalls"

function readTextOverlay(value: unknown): TextOverlay | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("messages" in value) ||
    !Array.isArray(value.messages) ||
    !value.messages.every((message) => typeof message === "string") ||
    ("title" in value &&
      value.title !== undefined &&
      typeof value.title !== "string")
  )
    return null
  return value as TextOverlay
}

/** Render selected-scene annotations as screen pixels, independent of the
 * scene's world coordinates, camera, lighting, and geometry bounds. */
export function renderSceneFromGLTF(
  scene: GLTFScene,
  options: RenderOptionsInput = {},
  imageFactory?: ImageFactory,
) {
  const sceneIndex = Number.isInteger(scene.gltf?.scene) ? scene.gltf.scene : 0
  const embedded =
    scene.gltf?.scenes?.[sceneIndex]?.extras?.poppygl?.textOverlay
  const textOverlay = readTextOverlay(
    options.textOverlay === undefined ? embedded : options.textOverlay,
  )
  return renderDrawCalls(
    scene.drawCalls,
    { ...options, textOverlay },
    imageFactory,
  )
}
