import { srgbDecodeLinear01 } from "../utils/srgbDecodeLinear01"

export interface DirectionalLightSettings {
  color: readonly [number, number, number]
  dir: readonly [number, number, number]
  intensity: number
}

export interface HemisphereLightSettings {
  skyColor: readonly [number, number, number]
  groundColor: readonly [number, number, number]
  intensity: number
  dir: readonly [number, number, number]
}

export interface CADViewerLights {
  ambientColor: readonly [number, number, number]
  hemisphere: HemisphereLightSettings
  directionalLights: DirectionalLightSettings[]
}

const normalize = (
  v: readonly [number, number, number],
): [number, number, number] => {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}

const lin = (hex: number): [number, number, number] => {
  const r = ((hex >> 16) & 0xff) / 255
  const g = ((hex >> 8) & 0xff) / 255
  const b = (hex & 0xff) / 255
  return [srgbDecodeLinear01(r), srgbDecodeLinear01(g), srgbDecodeLinear01(b)]
}

const colorAt = (hex: number, intensity: number): [number, number, number] => {
  const [r, g, b] = lin(hex)
  return [r * intensity, g * intensity, b * intensity]
}

const fromCadFrame = (
  dir: readonly [number, number, number],
): [number, number, number] => {
  const n = normalize(dir)
  return [-n[0], n[2], -n[1]]
}

export const CAD_VIEWER_LIGHTS: CADViewerLights = {
  ambientColor: colorAt(0xf6fbf8, 0.22),
  hemisphere: {
    skyColor: lin(0xe4f1ed),
    groundColor: lin(0x18221d),
    intensity: 0.2,
    dir: [0, 0, -1],
  },
  directionalLights: [
    {
      color: lin(0xfff8ee),
      intensity: 1.35,
      dir: fromCadFrame([0.68, -0.8, 1.08]),
    },
    {
      color: lin(0xdce8f2),
      intensity: 0.25,
      dir: fromCadFrame([-0.85, 0.55, 0.75]),
    },
    {
      color: lin(0xb9ead3),
      intensity: 0.5,
      dir: fromCadFrame([-0.35, 0.85, 0.95]),
    },
    {
      color: lin(0xfff8ee),
      intensity: 1.35 * 0.75,
      dir: fromCadFrame([0.68, -0.8, -1.08]),
    },
    {
      color: lin(0xdce8f2),
      intensity: 0.25 * 0.75,
      dir: fromCadFrame([-0.85, 0.55, -0.75]),
    },
    {
      color: lin(0xb9ead3),
      intensity: 0.5 * 0.75,
      dir: fromCadFrame([-0.35, 0.85, -0.95]),
    },
  ],
}
