import type { GridOptions } from "../gltf/types"

export const DEFAULT_LIGHT_DIR = [-0.4, -0.9, -0.2] as const

export interface DebugPoint {
  label: string
  position: {
    x: number
    y: number
    z: number
  }
}

/** Guide polyline in right-handed glTF scene coordinates (normally +Y up),
 * using the model's scene units. Each vertex is a point, not a displacement.
 */
export interface ExplosionLine {
  points: readonly (readonly [number, number, number])[]
  /** Linear RGB, 0..1; defaults to a muted blue. */
  color?: readonly [number, number, number]
  /** Defaults to true. Visible segments respect scene depth. */
  dashed?: boolean
}

export type CameraUp = "y+" | "y-" | "x+" | "x-" | "z+" | "z-"

export interface CameraRotation {
  x: number
  y: number
  z: number
}

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
  /** Opt into metallic/roughness studio lighting and geometry-based soft shadows. */
  realistic: boolean
  width: number
  height: number
  supersampling: number
  fov: number
  cull: boolean
  gamma: boolean
  ambient: number
  lightDir: readonly [number, number, number]
  camPos?: readonly [number, number, number] | null
  lookAt?: readonly [number, number, number] | null
  up: CameraUp
  cameraRotation: CameraRotation | null
  backgroundColor?: readonly [number, number, number] | string | null
  grid?: boolean | GridOptions
  debugPoints?: DebugPoint[] | null
  debugFontSize?: number | null
  debugPointColor?: readonly [number, number, number] | null
  debugLabelColor?: readonly [number, number, number] | null
  explosionLines?: readonly ExplosionLine[] | null
}

export type RenderOptionsInput = Partial<RenderOptions>

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  realistic: false,
  width: 800,
  height: 600,
  supersampling: 1,
  fov: 60,
  cull: true,
  gamma: true,
  ambient: 0.15,
  lightDir: DEFAULT_LIGHT_DIR,
  camPos: null,
  lookAt: null,
  up: "y+",
  cameraRotation: null,
  backgroundColor: null,
  grid: false,
  debugPoints: null,
  debugFontSize: null,
  debugPointColor: null,
  debugLabelColor: null,
  explosionLines: null,
}

export function getDefaultRenderOptions(): RenderOptions {
  return { ...DEFAULT_RENDER_OPTIONS }
}
