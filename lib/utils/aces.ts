// three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js
function rrtAndOdtFit(v: number): number {
  return (
    (v * (v + 0.0245786) - 0.000090537) /
    (v * (0.983729 * v + 0.432951) + 0.238081)
  )
}

export function acesFilmicToneMapping(
  color: [number, number, number],
  exposure = 1,
): [number, number, number] {
  const s = exposure / 0.6
  const r = color[0] * s
  const g = color[1] * s
  const b = color[2] * s

  const rIn = 0.59719 * r + 0.35458 * g + 0.04823 * b
  const gIn = 0.076 * r + 0.90834 * g + 0.01566 * b
  const bIn = 0.0284 * r + 0.13383 * g + 0.83777 * b

  const rFit = rrtAndOdtFit(rIn)
  const gFit = rrtAndOdtFit(gIn)
  const bFit = rrtAndOdtFit(bIn)

  color[0] = Math.min(
    1,
    Math.max(0, 1.60475 * rFit - 0.53108 * gFit - 0.07367 * bFit),
  )
  color[1] = Math.min(
    1,
    Math.max(0, -0.10208 * rFit + 1.10813 * gFit - 0.00605 * bFit),
  )
  color[2] = Math.min(
    1,
    Math.max(0, -0.00327 * rFit - 0.07276 * gFit + 1.07602 * bFit),
  )
  return color
}
