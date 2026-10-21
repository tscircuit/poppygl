// glTF sampler wrap modes. REPEAT is the spec default when a texture has no sampler or no wrapS/wrapT.
export const GLTF_WRAP_CLAMP_TO_EDGE = 33071
export const GLTF_WRAP_MIRRORED_REPEAT = 33648
export const GLTF_WRAP_REPEAT = 10497

export interface TextureWrap {
  wrapS: number
  wrapT: number
}

/**
 * Map a texture coordinate into [0, 1] using a glTF wrap mode.
 * Coordinates already inside [0, 1] are returned unchanged so in-range sampling is identical for every mode.
 */
export function wrapTextureCoordinate(
  t: number,
  mode: number = GLTF_WRAP_REPEAT,
): number {
  if (!(t < 0 || t > 1)) return t
  if (mode === GLTF_WRAP_CLAMP_TO_EDGE) return t < 0 ? 0 : 1
  if (mode === GLTF_WRAP_MIRRORED_REPEAT) {
    const m = t - 2 * Math.floor(t / 2)
    return m > 1 ? 2 - m : m
  }
  return t - Math.floor(t)
}
