import {
  DEFAULT_RENDER_OPTIONS,
  type RenderOptions,
  type RenderOptionsInput,
} from "./getDefaultRenderOptions"

export function resolveRenderOptions(
  options: RenderOptionsInput = {},
): RenderOptions {
  const supersampling =
    typeof options.supersampling === "number" &&
    Number.isFinite(options.supersampling)
      ? Math.max(1, Math.floor(options.supersampling))
      : DEFAULT_RENDER_OPTIONS.supersampling

  return {
    ...DEFAULT_RENDER_OPTIONS,
    ...options,
    supersampling,
    lightDir:
      options.lightDir != null
        ? (options.lightDir as RenderOptions["lightDir"])
        : DEFAULT_RENDER_OPTIONS.lightDir,
    camPos:
      options.camPos !== undefined
        ? (options.camPos as RenderOptions["camPos"])
        : DEFAULT_RENDER_OPTIONS.camPos,
    lookAt:
      options.lookAt !== undefined
        ? (options.lookAt as RenderOptions["lookAt"])
        : DEFAULT_RENDER_OPTIONS.lookAt,
  }
}
