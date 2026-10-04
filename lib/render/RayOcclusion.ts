import { vec3 } from "gl-matrix"
import type { DrawCall, Material } from "../gltf/types"

type V3 = [number, number, number]
interface Triangle {
  p: V3
  e1: V3
  e2: V3
  min: V3
  max: V3
  center: V3
  material: Material
}
export interface RayHit {
  position: V3
  normal: V3
  material: Material
  distance: number
}
interface Node {
  min: V3
  max: V3
  left?: Node
  right?: Node
  triangles?: Triangle[]
}

/** World-space, two-sided occluders. Translucent primitives are excluded.
 * Coordinates retain the input scene's units; bias scales with its bounds.
 */
export class RayOcclusion {
  private root: Node | null
  readonly bias: number

  constructor(drawCalls: DrawCall[]) {
    const triangles: Triangle[] = []
    for (const dc of drawCalls) {
      if ((dc.mode ?? 4) !== 4 || dc.material.alphaMode === "BLEND") continue
      // MASK textures require alpha-aware ray traversal; do not turn cutouts
      // into solid occluders while that is unsupported.
      if (dc.material.alphaMode === "MASK") continue
      const count = dc.indices?.length ?? dc.positions.length / 3
      const vertex = (index: number): V3 => {
        const i = (dc.indices?.[index] ?? index) * 3
        const p = vec3.transformMat4(
          vec3.create(),
          [dc.positions[i]!, dc.positions[i + 1]!, dc.positions[i + 2]!],
          dc.model,
        )
        return [p[0], p[1], p[2]]
      }
      for (let i = 0; i < count; i += 3) {
        const p = vertex(i),
          q = vertex(i + 1),
          r = vertex(i + 2)
        const min: V3 = [0, 1, 2].map((a) =>
          Math.min(p[a]!, q[a]!, r[a]!),
        ) as V3
        const max: V3 = [0, 1, 2].map((a) =>
          Math.max(p[a]!, q[a]!, r[a]!),
        ) as V3
        triangles.push({
          p,
          e1: q.map((v, a) => v - p[a]!) as V3,
          e2: r.map((v, a) => v - p[a]!) as V3,
          min,
          max,
          center: min.map((v, a) => (v + max[a]!) / 2) as V3,
          material: dc.material,
        })
      }
    }
    this.root = triangles.length ? this.build(triangles) : null
    const extent = this.root
      ? Math.hypot(...this.root.max.map((v, a) => v - this.root!.min[a]!))
      : 1
    this.bias = Math.max(1e-7, extent * 1e-5)
  }

  private build(triangles: Triangle[]): Node {
    const min: V3 = [Infinity, Infinity, Infinity],
      max: V3 = [-Infinity, -Infinity, -Infinity]
    for (const t of triangles)
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a]!, t.min[a]!)
        max[a] = Math.max(max[a]!, t.max[a]!)
      }
    if (triangles.length <= 8) return { min, max, triangles }
    // Surface-area splits isolate huge studio-floor triangles. Median splits
    // mix them into many nodes, making almost every background ray expensive.
    const area = (lo: V3, hi: V3) => {
      const x = hi[0] - lo[0],
        y = hi[1] - lo[1],
        z = hi[2] - lo[2]
      return 2 * (x * y + y * z + z * x)
    }
    let bestCost = Infinity,
      middle = triangles.length >> 1,
      best = triangles
    for (let axis = 0; axis < 3; axis++) {
      const sorted = triangles
        .slice()
        .sort((a, b) => a.center[axis]! - b.center[axis]!)
      const suffix = new Float64Array(sorted.length)
      let lo: V3 = [Infinity, Infinity, Infinity],
        hi: V3 = [-Infinity, -Infinity, -Infinity]
      for (let i = sorted.length - 1; i >= 0; i--) {
        for (let a = 0; a < 3; a++) {
          lo[a] = Math.min(lo[a]!, sorted[i]!.min[a]!)
          hi[a] = Math.max(hi[a]!, sorted[i]!.max[a]!)
        }
        suffix[i] = area(lo, hi)
      }
      lo = [Infinity, Infinity, Infinity]
      hi = [-Infinity, -Infinity, -Infinity]
      for (let i = 1; i < sorted.length; i++) {
        const triangle = sorted[i - 1]!
        for (let a = 0; a < 3; a++) {
          lo[a] = Math.min(lo[a]!, triangle.min[a]!)
          hi[a] = Math.max(hi[a]!, triangle.max[a]!)
        }
        if (triangle.center[axis] === sorted[i]!.center[axis]) continue
        const cost = area(lo, hi) * i + suffix[i]! * (sorted.length - i)
        if (cost < bestCost) {
          bestCost = cost
          middle = i
          best = sorted
        }
      }
    }
    return {
      min,
      max,
      left: this.build(best.slice(0, middle)),
      right: this.build(best.slice(middle)),
    }
  }

  occluded(origin: V3, direction: V3, maxDistance = Infinity): boolean {
    return this.root
      ? this.intersect(this.root, origin, direction, maxDistance)
      : false
  }

  /** Closest opaque triangle for one-bounce reflections and diffuse fill. */
  trace(origin: V3, direction: V3, maxDistance = Infinity): RayHit | null {
    const state: { hit: RayHit | null; limit: number } = {
      hit: null,
      limit: maxDistance,
    }
    if (this.root)
      this.intersect(this.root, origin, direction, maxDistance, state)
    return state.hit
  }

  private intersect(
    node: Node,
    o: V3,
    d: V3,
    limit: number,
    state?: { hit: RayHit | null; limit: number },
  ): boolean {
    if (state) limit = state.limit
    let near = 0,
      far = limit
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]!) < 1e-12) {
        if (o[a]! < node.min[a]! || o[a]! > node.max[a]!) return false
        continue
      }
      const t0 = (node.min[a]! - o[a]!) / d[a]!,
        t1 = (node.max[a]! - o[a]!) / d[a]!
      near = Math.max(near, Math.min(t0, t1))
      far = Math.min(far, Math.max(t0, t1))
      if (far < near) return false
    }
    if (node.triangles) {
      for (const { p, e1, e2, material } of node.triangles) {
        const px = d[1] * e2[2] - d[2] * e2[1],
          py = d[2] * e2[0] - d[0] * e2[2],
          pz = d[0] * e2[1] - d[1] * e2[0]
        const det = e1[0] * px + e1[1] * py + e1[2] * pz
        if (Math.abs(det) < 1e-12) continue
        const inv = 1 / det,
          tx = o[0] - p[0],
          ty = o[1] - p[1],
          tz = o[2] - p[2]
        const u = (tx * px + ty * py + tz * pz) * inv
        if (u < 0 || u > 1) continue
        const qx = ty * e1[2] - tz * e1[1],
          qy = tz * e1[0] - tx * e1[2],
          qz = tx * e1[1] - ty * e1[0]
        const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv
        if (v < 0 || u + v > 1) continue
        const distance = (e2[0] * qx + e2[1] * qy + e2[2] * qz) * inv
        if (distance > this.bias * 0.25 && distance < limit) {
          if (!state) return true
          const normal: V3 = [
            e1[1] * e2[2] - e1[2] * e2[1],
            e1[2] * e2[0] - e1[0] * e2[2],
            e1[0] * e2[1] - e1[1] * e2[0],
          ]
          const length = Math.hypot(...normal) || 1
          for (let a = 0; a < 3; a++) normal[a]! /= length
          if (normal[0] * d[0] + normal[1] * d[1] + normal[2] * d[2] > 0)
            for (let a = 0; a < 3; a++) normal[a]! *= -1
          state.hit = {
            position: [
              o[0] + d[0] * distance,
              o[1] + d[1] * distance,
              o[2] + d[2] * distance,
            ],
            normal,
            material,
            distance,
          }
          state.limit = limit = distance
        }
      }
      return false
    }
    if (state) {
      this.intersect(node.left!, o, d, limit, state)
      this.intersect(node.right!, o, d, state.limit, state)
      return state.hit !== null
    }
    return (
      this.intersect(node.left!, o, d, limit) ||
      this.intersect(node.right!, o, d, limit)
    )
  }
}
