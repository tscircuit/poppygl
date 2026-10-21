import { mat4, vec3 } from "gl-matrix"
import earcut from "earcut"
import type { DrawCall } from "../gltf/types"
import { createUint8Bitmap } from "../image/createUint8Bitmap"

export type SectionAxis = "x" | "y" | "z"
type Point2 = [number, number]

/** Axis-aligned plane in world/glTF coordinates, in model scene units. */
export interface EngineeringSection {
  axis: SectionAxis
  offset: number
  keepSide: "less" | "greater"
  /** Distance between diagonal hatch strokes in scene units; defaults to 1. */
  hatchSpacing?: number
}

// Welded cut segments and nested rings follow gltf-slice and 3d-viewer's cap approach.
export function findSectionLoops(input: {
  positions: Float32Array
  axis: SectionAxis
  offset: number
  epsilon?: number
}): { loops: Point2[][]; openChains: number } {
  const { positions, axis, offset, epsilon = 0.00001 } = input
  const k = axis === "x" ? 0 : axis === "y" ? 1 : 2
  let minimum = Infinity,
    maximum = -Infinity
  for (let i = k; i < positions.length; i += 3) {
    minimum = Math.min(minimum, positions[i]!)
    maximum = Math.max(maximum, positions[i]!)
  }
  if (offset <= minimum + epsilon || offset >= maximum - epsilon)
    return { loops: [], openChains: 0 }
  const u = (k + 1) % 3
  const v = (k + 2) % 3
  const points = new Map<string, Point2>()
  const adjacency = new Map<string, Set<string>>()
  const edges = new Set<string>()
  const key = (p: Point2) =>
    `${Math.round(p[0] / epsilon)},${Math.round(p[1] / epsilon)}`
  for (let i = 0; i < positions.length; i += 9) {
    const hits: Point2[] = []
    const distances = [0, 1, 2].map((j) => positions[i + j * 3 + k]! - offset)
    // Tangencies and triangles lying on the plane are not new cut surfaces.
    const onPlane = distances.filter((d) => Math.abs(d) <= epsilon).length
    if (onPlane === 3) continue
    if (
      !(
        distances.some((d) => d > epsilon) &&
        distances.some((d) => d < -epsilon)
      ) &&
      !(onPlane === 2 && distances.some((d) => d < -epsilon))
    )
      continue
    for (let j = 0; j < 3; j++) {
      const a = i + j * 3
      const b = i + ((j + 1) % 3) * 3
      const da = distances[j]!
      const db = distances[(j + 1) % 3]!
      if (Math.abs(da) <= epsilon)
        hits.push([positions[a + u]!, positions[a + v]!])
      else if (da > 0 !== db > 0 && Math.abs(db) > epsilon) {
        const t = da / (da - db)
        hits.push([
          positions[a + u]! + t * (positions[b + u]! - positions[a + u]!),
          positions[a + v]! + t * (positions[b + v]! - positions[a + v]!),
        ])
      }
    }
    const unique = [...new Map(hits.map((p) => [key(p), p])).values()]
    if (unique.length !== 2) continue
    const [a, b] = unique.map(key) as [string, string]
    if (a === b) continue
    const edge = a < b ? `${a}|${b}` : `${b}|${a}`
    if (edges.has(edge)) continue
    edges.add(edge)
    points.set(a, unique[0]!)
    points.set(b, unique[1]!)
    if (!adjacency.has(a)) adjacency.set(a, new Set())
    if (!adjacency.has(b)) adjacency.set(b, new Set())
    adjacency.get(a)!.add(b)
    adjacency.get(b)!.add(a)
  }
  const loops: Point2[][] = []
  let openChains = 0
  while (edges.size) {
    const first = edges.values().next().value!
    const [start, next] = first.split("|") as [string, string]
    const path = [start]
    let previous = start
    let current = next
    const remove = (a: string, b: string) => {
      edges.delete(a < b ? `${a}|${b}` : `${b}|${a}`)
      adjacency.get(a)?.delete(b)
      adjacency.get(b)?.delete(a)
    }
    remove(start, next)
    while (current !== start) {
      path.push(current)
      const candidates = [...(adjacency.get(current) ?? [])]
      if (!candidates.length) break
      // Prefer the straightest continuation at welded junctions.
      const p = points.get(previous)!
      const c = points.get(current)!
      candidates.sort((a, b) => {
        const score = (s: string) => {
          const n = points.get(s)!
          return (
            ((c[0] - p[0]) * (n[0] - c[0]) + (c[1] - p[1]) * (n[1] - c[1])) /
            (Math.hypot(n[0] - c[0], n[1] - c[1]) || 1)
          )
        }
        return score(b) - score(a)
      })
      const chosen = candidates[0]!
      remove(current, chosen)
      previous = current
      current = chosen
    }
    if (current === start && path.length >= 3)
      loops.push(path.map((p) => points.get(p)!))
    else openChains++
  }
  return { loops, openChains }
}

function contains(p: Point2, polygon: Point2[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside
  }
  return inside
}

/** Prepare opaque monochrome section geometry without modifying the input.
 * Separate primitives are capped independently; open surfaces remain uncapped.
 */
export function createEngineeringSection(
  drawCalls: DrawCall[],
  spec: EngineeringSection,
) {
  const k = spec.axis === "x" ? 0 : spec.axis === "y" ? 1 : 2
  const u = (k + 1) % 3,
    v = (k + 2) % 3
  const spacing = spec.hatchSpacing ?? 1
  if (
    !["x", "y", "z"].includes(spec.axis) ||
    !Number.isFinite(spec.offset) ||
    !["less", "greater"].includes(spec.keepSide) ||
    !Number.isFinite(spacing) ||
    spacing <= 0
  )
    throw new Error("Invalid engineering section plane or hatch spacing")
  const output: DrawCall[] = []
  let openChains = 0
  const texture = createUint8Bitmap(128, 128)
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const c = (x + 127 - y) % 16 < 2 ? 0 : 255
      texture.data.set([c, c, c, 255], (y * 128 + x) * 4)
    }
  const sign = spec.keepSide === "less" ? 1 : -1
  for (const dc of drawCalls) {
    const points: number[][] = []
    for (let i = 0; i < dc.positions.length; i += 3)
      points.push(
        Array.from(
          vec3.transformMat4(
            vec3.create(),
            dc.positions.subarray(i, i + 3),
            dc.model,
          ),
        ),
      )
    const indices = dc.indices ?? Uint32Array.from(points, (_, i) => i)
    const clipped: number[] = [],
      triangles: number[] = []
    const distance = (p: number[]) => sign * (p[k]! - spec.offset)
    const intersection = (a: number[], b: number[]) => {
      const t = distance(a) / (distance(a) - distance(b))
      return a.map((n, j) => n + t * (b[j]! - n))
    }
    if (dc.mode === 1) {
      for (let i = 0; i + 1 < indices.length; i += 2) {
        let a = points[indices[i]!]!,
          b = points[indices[i + 1]!]!
        if (distance(a) > 0 && distance(b) > 0) continue
        if (distance(a) > 0) a = intersection(a, b)
        else if (distance(b) > 0) b = intersection(a, b)
        clipped.push(...a, ...b)
      }
      output.push({
        ...dc,
        positions: new Float32Array(clipped),
        indices: null,
        model: mat4.create(),
      })
      continue
    }
    if (dc.mode != null && dc.mode !== 4) continue
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const triangle = [
        points[indices[i]!]!,
        points[indices[i + 1]!]!,
        points[indices[i + 2]!]!,
      ]
      triangles.push(...triangle.flat())
      const polygon: number[][] = []
      for (let j = 0; j < 3; j++) {
        const a = triangle[j]!,
          b = triangle[(j + 1) % 3]!
        if (distance(a) <= 0) polygon.push(a)
        if (
          (distance(a) < 0 && distance(b) > 0) ||
          (distance(a) > 0 && distance(b) < 0)
        )
          polygon.push(intersection(a, b))
      }
      for (let j = 1; j + 1 < polygon.length; j++)
        clipped.push(...polygon[0]!, ...polygon[j]!, ...polygon[j + 1]!)
    }
    const white = {
      baseColorFactor: [1, 1, 1, 1] as [number, number, number, number],
      baseColorTexture: null,
    }
    const mesh: DrawCall = {
      ...dc,
      positions: new Float32Array(clipped),
      indices: null,
      model: mat4.create(),
      normals: null,
      colors: null,
      uvs: null,
      material: white,
    }
    output.push(mesh)
    // Tolerance scales with the mesh's extent rather than its world translation.
    const extent = Math.max(
      ...[0, 1, 2].map((axis) => {
        let min = Infinity,
          max = -Infinity
        for (const p of points) {
          min = Math.min(min, p[axis]!)
          max = Math.max(max, p[axis]!)
        }
        return max - min
      }),
    )
    const result = findSectionLoops({
      positions: new Float32Array(triangles),
      axis: spec.axis,
      offset: spec.offset,
      epsilon: Math.max(extent * 1e-7, 1e-9),
    })
    openChains += result.openChains
    const rings = result.loops
      .map((points) => ({
        points,
        area: Math.abs(
          points.reduce((a, p, i) => {
            const q = points[(i + 1) % points.length]!
            return a + p[0] * q[1] - q[0] * p[1]
          }, 0),
        ),
        parent: -1,
        depth: 0,
      }))
      .sort((a, b) => b.area - a.area)
    rings.forEach((ring, i) => {
      for (let j = 0; j < i; j++)
        if (contains(ring.points[0]!, rings[j]!.points)) ring.parent = j
      ring.depth = ring.parent < 0 ? 0 : rings[ring.parent]!.depth + 1
    })
    const cap: number[] = [],
      uv: number[] = []
    rings.forEach((ring, i) => {
      if (ring.depth % 2) return
      const holes = rings.filter((r) => r.parent === i && r.depth % 2)
      const flat = [...ring.points],
        starts: number[] = []
      for (const hole of holes) {
        starts.push(flat.length)
        flat.push(...hole.points)
      }
      const faces = earcut(flat.flat(), starts, 2)
      for (let j = 0; j < faces.length; j += 3) {
        const ids = faces.slice(j, j + 3)
        const a = flat[ids[0]!]!,
          b = flat[ids[1]!]!,
          c = flat[ids[2]!]!
        if (
          ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) *
            sign <
          0
        )
          ids.reverse()
        for (const id of ids) {
          const p = flat[id]!,
            xyz = [0, 0, 0]
          xyz[k] = spec.offset
          xyz[u] = p[0]
          xyz[v] = p[1]
          cap.push(...xyz)
          uv.push(
            p[0] / (spacing * 8 * Math.SQRT2),
            p[1] / (spacing * 8 * Math.SQRT2),
          )
        }
      }
    })
    if (cap.length)
      output.push({
        ...mesh,
        engineeringSectionCap: true,
        positions: new Float32Array(cap),
        uvs: new Float32Array(uv),
        material: {
          ...white,
          baseColorTexture: texture,
          baseColorTextureWrap: "repeat",
        },
      })
  }
  return { drawCalls: output, openChains }
}
