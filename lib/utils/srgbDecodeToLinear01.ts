export function srgbDecodeToLinear01(srgb: number) {
  if (srgb <= 0.04045) return srgb / 12.92
  return ((srgb + 0.055) / 1.055) ** 2.4
}
