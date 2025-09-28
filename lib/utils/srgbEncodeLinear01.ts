export function srgbEncodeLinear01(linear: number) {
  if (linear <= 0.0031308) return 12.92 * linear
  return 1.055 * Math.pow(linear, 1 / 2.4) - 0.055
}
