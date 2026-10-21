import type { vec4 } from "gl-matrix"

/** Clip before dividing by W, including a screen-space margin for the stroke.
 * This also bounds work for off-screen endpoints and lines crossing the eye.
 */
function clipLine(
  start: vec4,
  end: vec4,
  marginX: number,
  marginY: number,
): [number[], number[]] | null {
  if (![...start, ...end].every(Number.isFinite)) return null
  const distances = (p: vec4) => [
    p[3] * (1 + marginX) + p[0],
    p[3] * (1 + marginX) - p[0],
    p[3] * (1 + marginY) + p[1],
    p[3] * (1 + marginY) - p[1],
    p[3] + p[2],
    p[3] - p[2],
  ]
  const a = distances(start)
  const b = distances(end)
  let from = 0
  let to = 1
  for (let plane = 0; plane < 6; plane++) {
    if (a[plane]! < 0 && b[plane]! < 0) return null
    if (a[plane]! < 0 !== b[plane]! < 0) {
      const t = a[plane]! / (a[plane]! - b[plane]!)
      if (a[plane]! < 0) from = Math.max(from, t)
      else to = Math.min(to, t)
    }
  }
  if (from > to) return null
  return [from, to].map((t) =>
    Array.from(start, (value, axis) => value + t * (end[axis]! - value)),
  ) as [number[], number[]]
}

/** Screen-space capsule coverage, evaluated once per segment/pixel. In
 * particular, translucent strokes are not repeatedly blended by DDA stamps.
 * Width and dash length are in the current raster's pixels.
 */
export function rasterizeWideLine(
  start: vec4,
  end: vec4,
  width: number,
  height: number,
  strokeWidth: number,
  dashed: boolean,
  dashLength: number,
  fragment: (x: number, y: number, z: number, coverage: number) => void,
) {
  const radius = strokeWidth / 2
  const padding = radius + 0.5
  const clipped = clipLine(
    start,
    end,
    (2 * padding) / Math.max(1, width - 1),
    (2 * padding) / Math.max(1, height - 1),
  )
  if (!clipped) return
  const project = (p: ArrayLike<number>) => [
    ((p[0]! / p[3]!) * 0.5 + 0.5) * (width - 1),
    (0.5 - (p[1]! / p[3]!) * 0.5) * (height - 1),
    // Clipping guarantees this range; absorb near/far-plane roundoff so an
    // endpoint's round cap is not discarded at z = -epsilon.
    Math.max(0, Math.min(1, (p[2]! / p[3]!) * 0.5 + 0.5)),
  ]
  const a = project(clipped[0])
  const b = project(clipped[1])
  if (![...a, ...b].every(Number.isFinite)) return
  const [x0, y0, z0] = a as [number, number, number]
  const [x1, y1, z1] = b as [number, number, number]
  const dx = x1 - x0
  const dy = y1 - y0
  const lengthSquared = dx * dx + dy * dy
  const length = Math.sqrt(lengthSquared)
  // Preserve dash phase when side clipping moves a positive-W endpoint.
  const original = start[3] > 0 ? project(start) : a
  const phase = Math.hypot(x0 - original[0]!, y0 - original[1]!)
  const drawPixel = (x: number, y: number) => {
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((x - x0) * dx + (y - y0) * dy) / lengthSquared),
          )
    if (dashed && Math.floor((phase + t * length) / dashLength) % 2 === 1)
      return
    const distance = Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy))
    const coverage = Math.min(1, padding - distance)
    if (coverage > 0) fragment(x, y, z0 + t * (z1 - z0), coverage)
  }
  // Scan the major axis with a narrow perpendicular band. A diagonal stroke
  // costs O(length * width), rather than its entire bounding rectangle.
  if (Math.abs(dx) >= Math.abs(dy)) {
    const band = length === 0 ? padding : (padding * length) / Math.abs(dx)
    const first = Math.max(0, Math.ceil(Math.min(x0, x1) - padding))
    const last = Math.min(width - 1, Math.floor(Math.max(x0, x1) + padding))
    for (let x = first; x <= last; x++) {
      const t = dx === 0 ? 0 : Math.max(0, Math.min(1, (x - x0) / dx))
      const centerY = y0 + t * dy
      const top = Math.max(0, Math.ceil(centerY - band))
      const bottom = Math.min(height - 1, Math.floor(centerY + band))
      for (let y = top; y <= bottom; y++) drawPixel(x, y)
    }
  } else {
    const band = (padding * length) / Math.abs(dy)
    const first = Math.max(0, Math.ceil(Math.min(y0, y1) - padding))
    const last = Math.min(height - 1, Math.floor(Math.max(y0, y1) + padding))
    for (let y = first; y <= last; y++) {
      const t = Math.max(0, Math.min(1, (y - y0) / dy))
      const centerX = x0 + t * dx
      const left = Math.max(0, Math.ceil(centerX - band))
      const right = Math.min(width - 1, Math.floor(centerX + band))
      for (let x = left; x <= right; x++) drawPixel(x, y)
    }
  }
}
