import { vec3 } from "gl-matrix"
import type { DrawCall, Material } from "../gltf/types"

type V3 = [number, number, number]
interface Triangle {
  p: V3
  e1: V3
  e2: V3
  normal: V3
  min: V3
  max: V3
  center: V3
  material: Material
}
type HitTriangle = Pick<Triangle, "normal" | "material">

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
  private bounds = new Float64Array(0)
  private escapes = new Uint32Array(0)
  private starts = new Uint32Array(0)
  private counts = new Uint8Array(0)
  private triangleData = new Float64Array(0)
  private triangles: HitTriangle[] = []
  readonly bias: number
  private inverse: V3 = [0, 0, 0]
  private parallelAxes = 0
  private closest: { hit: HitTriangle | null; limit: number } = {
    hit: null,
    limit: Infinity,
  }

  constructor(drawCalls: DrawCall[]) {
    const triangles: Triangle[] = []
    for (const dc of drawCalls) {
      if ((dc.mode ?? 4) !== 4 || dc.material.alphaMode === "BLEND") continue
      // MASK textures require alpha-aware ray traversal; do not turn cutouts
      // into solid occluders while that is unsupported.
      if (dc.material.alphaMode === "MASK") continue
      const count = dc.indices?.length ?? dc.positions.length / 3
      // Indexed meshes reuse vertices across faces. Transform each one once,
      // keeping gl-matrix's existing Float32 rounding before building bounds.
      const worldVertices: V3[] = []
      for (let i = 0; i < dc.positions.length; i += 3) {
        const p = vec3.transformMat4(
          vec3.create(),
          [dc.positions[i]!, dc.positions[i + 1]!, dc.positions[i + 2]!],
          dc.model,
        )
        worldVertices.push([p[0], p[1], p[2]])
      }
      const vertex = (index: number): V3 =>
        worldVertices[dc.indices?.[index] ?? index]!
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
        const e1 = q.map((v, a) => v - p[a]!) as V3,
          e2 = r.map((v, a) => v - p[a]!) as V3
        const normal: V3 = [
          e1[1] * e2[2] - e1[2] * e2[1],
          e1[2] * e2[0] - e1[0] * e2[2],
          e1[0] * e2[1] - e1[1] * e2[0],
        ]
        const length = Math.hypot(...normal) || 1
        for (let a = 0; a < 3; a++) normal[a]! /= length
        triangles.push({
          p,
          e1,
          e2,
          normal,
          min,
          max,
          center: min.map((v, a) => (v + max[a]!) / 2) as V3,
          material: dc.material,
        })
      }
    }
    const root = triangles.length ? this.build(triangles) : null
    if (root) this.flatten(root, triangles.length)
    const extent = root
      ? Math.hypot(...root.max.map((v, a) => v - root.min[a]!))
      : 1
    this.bias = Math.max(1e-7, extent * 1e-5)
  }

  /** Preorder bounds with subtree escape offsets retain the existing SAH
   * primitive order, while avoiding recursive calls and pointer-heavy nodes
   * during millions of ray queries. Float64 retains the original precision.
   */
  private flatten(root: Node, triangleCount: number) {
    const nodes: Node[] = [],
      escapes: number[] = []
    const visit = (node: Node) => {
      const index = nodes.length
      nodes.push(node)
      escapes.push(0)
      if (!node.triangles) {
        visit(node.left!)
        visit(node.right!)
      }
      escapes[index] = nodes.length
    }
    visit(root)
    this.bounds = new Float64Array(nodes.length * 6)
    this.escapes = Uint32Array.from(escapes)
    this.starts = new Uint32Array(nodes.length)
    this.counts = new Uint8Array(nodes.length)
    this.triangleData = new Float64Array(triangleCount * 9)
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!
      this.bounds.set(node.min, i * 6)
      this.bounds.set(node.max, i * 6 + 3)
      if (!node.triangles) continue
      this.starts[i] = this.triangles.length
      this.counts[i] = node.triangles.length
      for (const triangle of node.triangles) {
        const offset = this.triangles.length * 9
        this.triangleData.set(triangle.p, offset)
        this.triangleData.set(triangle.e1, offset + 3)
        this.triangleData.set(triangle.e2, offset + 6)
        this.triangles.push({
          normal: triangle.normal,
          material: triangle.material,
        })
      }
    }
  }

  private build(triangles: Triangle[]): Node {
    const min: V3 = [Infinity, Infinity, Infinity],
      max: V3 = [-Infinity, -Infinity, -Infinity],
      centerMin: V3 = [Infinity, Infinity, Infinity],
      centerMax: V3 = [-Infinity, -Infinity, -Infinity]
    for (const t of triangles)
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a]!, t.min[a]!)
        max[a] = Math.max(max[a]!, t.max[a]!)
        centerMin[a] = Math.min(centerMin[a]!, t.center[a]!)
        centerMax[a] = Math.max(centerMax[a]!, t.center[a]!)
      }
    if (triangles.length <= 8) return { min, max, triangles }
    // Binned surface-area splits keep the floor/large PCB faces isolated without
    // sorting every subtree three times. Float64 bounds preserve ray precision.
    const binCount = 16
    const area = (lo: V3, hi: V3) => {
      const x = hi[0] - lo[0],
        y = hi[1] - lo[1],
        z = hi[2] - lo[2]
      return 2 * (x * y + y * z + z * x)
    }
    let bestCost = Infinity,
      bestAxis = -1,
      bestSplit = 0,
      bestMin = 0,
      bestScale = 0
    let longestAxis = 0
    for (let a = 1; a < 3; a++)
      if (
        centerMax[a]! - centerMin[a]! >
        centerMax[longestAxis]! - centerMin[longestAxis]!
      )
        longestAxis = a
    for (let axis = 0; axis < 3; axis++) {
      // Retain full SAH near the root, then bin along the widest centroid axis
      // to avoid paying for three equivalent small-subtree searches.
      if (triangles.length <= 4096 && axis !== longestAxis) continue
      const loCenter = centerMin[axis]!,
        hiCenter = centerMax[axis]!
      if (loCenter === hiCenter) continue
      const scale = binCount / (hiCenter - loCenter)
      const counts = new Uint32Array(binCount)
      const bounds = new Float64Array(binCount * 6)
      for (let i = 0; i < binCount; i++) {
        bounds.fill(Infinity, i * 6, i * 6 + 3)
        bounds.fill(-Infinity, i * 6 + 3, i * 6 + 6)
      }
      for (const t of triangles) {
        const bin = Math.min(
          binCount - 1,
          Math.floor((t.center[axis]! - loCenter) * scale),
        )
        counts[bin]!++
        const offset = bin * 6
        for (let a = 0; a < 3; a++) {
          bounds[offset + a] = Math.min(bounds[offset + a]!, t.min[a]!)
          bounds[offset + a + 3] = Math.max(bounds[offset + a + 3]!, t.max[a]!)
        }
      }
      const suffixCost = new Float64Array(binCount)
      let lo: V3 = [Infinity, Infinity, Infinity],
        hi: V3 = [-Infinity, -Infinity, -Infinity],
        count = 0
      for (let i = binCount - 1; i >= 0; i--) {
        count += counts[i]!
        if (counts[i])
          for (let a = 0; a < 3; a++) {
            lo[a] = Math.min(lo[a]!, bounds[i * 6 + a]!)
            hi[a] = Math.max(hi[a]!, bounds[i * 6 + a + 3]!)
          }
        suffixCost[i] = count ? area(lo, hi) * count : 0
      }
      lo = [Infinity, Infinity, Infinity]
      hi = [-Infinity, -Infinity, -Infinity]
      count = 0
      for (let i = 0; i < binCount - 1; i++) {
        count += counts[i]!
        if (counts[i])
          for (let a = 0; a < 3; a++) {
            lo[a] = Math.min(lo[a]!, bounds[i * 6 + a]!)
            hi[a] = Math.max(hi[a]!, bounds[i * 6 + a + 3]!)
          }
        if (!count || count === triangles.length) continue
        const cost = area(lo, hi) * count + suffixCost[i + 1]!
        if (cost < bestCost) {
          bestCost = cost
          bestAxis = axis
          bestSplit = i
          bestMin = loCenter
          bestScale = scale
        }
      }
    }
    let left: Triangle[], right: Triangle[]
    if (bestAxis < 0) {
      const middle = triangles.length >> 1
      left = triangles.slice(0, middle)
      right = triangles.slice(middle)
    } else {
      left = []
      right = []
      for (const t of triangles) {
        const bin = Math.min(
          binCount - 1,
          Math.floor((t.center[bestAxis]! - bestMin) * bestScale),
        )
        ;(bin <= bestSplit ? left : right).push(t)
      }
    }
    return { min, max, left: this.build(left), right: this.build(right) }
  }

  private prepareRay(direction: V3) {
    this.parallelAxes = 0
    for (let a = 0; a < 3; a++) {
      this.inverse[a] = 1 / direction[a]!
      if (Math.abs(direction[a]!) < 1e-12) this.parallelAxes |= 1 << a
    }
  }

  occluded(origin: V3, direction: V3, maxDistance = Infinity): boolean {
    this.prepareRay(direction)
    return this.intersect(origin, direction, maxDistance)
  }

  /** Closest opaque triangle for one-bounce reflections and diffuse fill. */
  trace(origin: V3, direction: V3, maxDistance = Infinity): RayHit | null {
    this.prepareRay(direction)
    const state = this.closest
    state.hit = null
    state.limit = maxDistance
    this.intersect(origin, direction, maxDistance, state)
    if (!state.hit) return null
    const { normal, material } = state.hit
    const sign = dotNormal(normal, direction) > 0 ? -1 : 1
    return {
      position: [
        origin[0] + direction[0] * state.limit,
        origin[1] + direction[1] * state.limit,
        origin[2] + direction[2] * state.limit,
      ],
      normal: [normal[0] * sign, normal[1] * sign, normal[2] * sign],
      material,
      distance: state.limit,
    }
  }

  private intersect(
    o: V3,
    d: V3,
    maxDistance: number,
    state?: { hit: HitTriangle | null; limit: number },
  ): boolean {
    const ox = o[0],
      oy = o[1],
      oz = o[2],
      dx = d[0],
      dy = d[1],
      dz = d[2],
      ix = this.inverse[0],
      iy = this.inverse[1],
      iz = this.inverse[2],
      parallel = this.parallelAxes,
      bounds = this.bounds,
      data = this.triangleData
    let node = 0
    while (node < this.counts.length) {
      const offset = node * 6
      let limit = state ? state.limit : maxDistance,
        near = 0,
        far = limit
      // Reject thin horizontal bounds first. Fixed indices keep slab tests
      // scalar and remove the dynamic axis loop from traversal.
      if (parallel & 2) {
        if (oy < bounds[offset + 1]! || oy > bounds[offset + 4]!) {
          node = this.escapes[node]!
          continue
        }
      } else {
        let t0 = (bounds[offset + 1]! - oy) * iy,
          t1 = (bounds[offset + 4]! - oy) * iy
        if (t0 > t1) {
          const swap = t0
          t0 = t1
          t1 = swap
        }
        if (t0 > near) near = t0
        if (t1 < far) far = t1
        if (far < near) {
          node = this.escapes[node]!
          continue
        }
      }
      if (parallel & 1) {
        if (ox < bounds[offset + 0]! || ox > bounds[offset + 3]!) {
          node = this.escapes[node]!
          continue
        }
      } else {
        let t0 = (bounds[offset + 0]! - ox) * ix,
          t1 = (bounds[offset + 3]! - ox) * ix
        if (t0 > t1) {
          const swap = t0
          t0 = t1
          t1 = swap
        }
        if (t0 > near) near = t0
        if (t1 < far) far = t1
        if (far < near) {
          node = this.escapes[node]!
          continue
        }
      }
      if (parallel & 4) {
        if (oz < bounds[offset + 2]! || oz > bounds[offset + 5]!) {
          node = this.escapes[node]!
          continue
        }
      } else {
        let t0 = (bounds[offset + 2]! - oz) * iz,
          t1 = (bounds[offset + 5]! - oz) * iz
        if (t0 > t1) {
          const swap = t0
          t0 = t1
          t1 = swap
        }
        if (t0 > near) near = t0
        if (t1 < far) far = t1
        if (far < near) {
          node = this.escapes[node]!
          continue
        }
      }
      const start = this.starts[node]!,
        end = start + this.counts[node]!
      for (let i = start; i < end; i++) {
        const offset = i * 9,
          p0 = data[offset]!,
          p1 = data[offset + 1]!,
          p2 = data[offset + 2]!,
          e10 = data[offset + 3]!,
          e11 = data[offset + 4]!,
          e12 = data[offset + 5]!,
          e20 = data[offset + 6]!,
          e21 = data[offset + 7]!,
          e22 = data[offset + 8]!
        const px = dy * e22 - dz * e21,
          py = dz * e20 - dx * e22,
          pz = dx * e21 - dy * e20
        const det = e10 * px + e11 * py + e12 * pz
        if (Math.abs(det) < 1e-12) continue
        const inv = 1 / det,
          tx = ox - p0,
          ty = oy - p1,
          tz = oz - p2
        const u = (tx * px + ty * py + tz * pz) * inv
        if (u < 0 || u > 1) continue
        const qx = ty * e12 - tz * e11,
          qy = tz * e10 - tx * e12,
          qz = tx * e11 - ty * e10
        const v = (dx * qx + dy * qy + dz * qz) * inv
        if (v < 0 || u + v > 1) continue
        const distance = (e20 * qx + e21 * qy + e22 * qz) * inv
        if (distance > this.bias * 0.25 && distance < limit) {
          if (!state) return true
          state.hit = this.triangles[i]!
          state.limit = limit = distance
        }
      }
      node++
    }
    return state?.hit != null
  }
}

function dotNormal(normal: V3, direction: V3) {
  return (
    normal[0] * direction[0] +
    normal[1] * direction[1] +
    normal[2] * direction[2]
  )
}
