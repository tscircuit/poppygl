// IEC 61966-2-1 sRGB EOTF
export function srgbDecodeLinear01(value: number): number {
  const c = Math.min(1, Math.max(0, value))
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
