import type { GridOptions } from "../gltf/types"

export const DEFAULT_LIGHT_DIR = [-0.4, -0.9, -0.2] as const

export interface RenderOptions {
  width: number
  height: number
  fov: number
  cull: boolean
  gamma: boolean
  ambient: number
  lightDir: readonly [number, number, number]
  camPos?: readonly [number, number, number] | null
  lookAt?: readonly [number, number, number] | null
  backgroundColor?: readonly [number, number, number] | null
  grid?: boolean | GridOptions
}

export type RenderOptionsInput = Partial<RenderOptions>

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  width: 800,
  height: 600,
  fov: 60,
  cull: true,
  gamma: true,
  ambient: 0.15,
  lightDir: DEFAULT_LIGHT_DIR,
  camPos: null,
  lookAt: null,
  backgroundColor: null,
  grid: false,
}

export function getDefaultRenderOptions(): RenderOptions {
  return { ...DEFAULT_RENDER_OPTIONS }
}
