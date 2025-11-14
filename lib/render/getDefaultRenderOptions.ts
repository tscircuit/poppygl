import type { GridOptions } from "../gltf/types"

export const DEFAULT_LIGHT_DIR = [-0.4, -0.9, -0.2] as const

/**
 * Convert a hex color string to RGB array with values 0-1
 * @param hex - Hex color string like "#ffffff" or "ffffff"
 * @returns RGB array [r, g, b] with values 0-1, or null if invalid
 */
export function hexToRgb(hex: string): [number, number, number] | null {
  const cleanHex = hex.replace(/^#/, "")

  // Validate hex string
  if (!/^[0-9A-Fa-f]{6}$/.test(cleanHex)) {
    return null
  }

  // Parse hex values
  const r = Number.parseInt(cleanHex.substring(0, 2), 16) / 255
  const g = Number.parseInt(cleanHex.substring(2, 4), 16) / 255
  const b = Number.parseInt(cleanHex.substring(4, 6), 16) / 255

  return [r, g, b]
}

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
  backgroundColor?: readonly [number, number, number] | string | null
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
