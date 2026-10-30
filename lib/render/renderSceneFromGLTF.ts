import type { GLTFScene } from "../gltf/types"
import type { ImageFactory } from "../image/createUint8Bitmap"
import type { RenderOptionsInput } from "./getDefaultRenderOptions"
import { renderDrawCalls } from "./renderDrawCalls"

/** Render the selected glTF scene's guides in scene-world coordinates.
 * Explicit options override extras; null or [] disables embedded guides.
 */
export function renderSceneFromGLTF(
  scene: GLTFScene,
  options: RenderOptionsInput = {},
  imageFactory?: ImageFactory,
) {
  return renderDrawCalls(
    scene.drawCalls,
    {
      ...options,
      explosionLines:
        options.explosionLines === undefined
          ? scene.explosionLines
          : options.explosionLines,
    },
    imageFactory,
  )
}
