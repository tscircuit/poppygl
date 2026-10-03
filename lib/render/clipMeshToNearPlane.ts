import type { mat4 } from "gl-matrix"
import type { DrawCall } from "../gltf/types"

/** Clip triangles before the perspective divide (OpenGL near plane: z + w >= 0).
 * Interpolate attributes in object space so the rasterizer can still perform
 * perspective-correct interpolation after projecting the new vertices.
 */
export function clipMeshToNearPlane(mesh: DrawCall, mvp: mat4): DrawCall {
  const count = mesh.positions.length / 3
  const distances = new Float64Array(count)
  let needsClipping = false
  for (let i = 0; i < count; i++) {
    const distance =
      (mvp[2]! + mvp[3]!) * mesh.positions[i * 3]! +
      (mvp[6]! + mvp[7]!) * mesh.positions[i * 3 + 1]! +
      (mvp[10]! + mvp[11]!) * mesh.positions[i * 3 + 2]! +
      mvp[14]! +
      mvp[15]!
    distances[i] = distance
    if (!(distance >= 0)) needsClipping = true
  }
  // Leave fully visible meshes untouched, including their original triangulation.
  if (!needsClipping) return mesh

  const positions = Array.from(mesh.positions)
  const normals = mesh.normals ? Array.from(mesh.normals) : null
  const uvs = mesh.uvs ? Array.from(mesh.uvs) : null
  const colors = mesh.colors ? Array.from(mesh.colors) : null
  const indices: number[] = []
  const sourceIndices =
    mesh.indices ?? Uint32Array.from({ length: count }, (_, i) => i)
  const intersections = new Map<string, number>()

  const intersect = (a: number, b: number): number => {
    // Reuse shared edges to avoid cracks between adjacent clipped triangles.
    if (a > b) [a, b] = [b, a]
    if (distances[a] === 0) return a
    if (distances[b] === 0) return b
    const key = `${a}:${b}`
    const cached = intersections.get(key)
    if (cached !== undefined) return cached
    const t = distances[a]! / (distances[a]! - distances[b]!)
    const index = positions.length / 3
    const interpolate = (values: number[] | null, size: number) => {
      if (!values) return
      for (let k = 0; k < size; k++) {
        const start = values[a * size + k]!
        values.push(start + t * (values[b * size + k]! - start))
      }
    }
    interpolate(positions, 3)
    interpolate(normals, 3)
    interpolate(uvs, 2)
    interpolate(colors, 3)
    intersections.set(key, index)
    return index
  }

  for (let i = 0; i < sourceIndices.length; i += 3) {
    const triangle = [
      sourceIndices[i]!,
      sourceIndices[i + 1]!,
      sourceIndices[i + 2]!,
    ]
    if (triangle.some((vertex) => !Number.isFinite(distances[vertex]))) continue
    const polygon: number[] = []
    for (let j = 0; j < 3; j++) {
      const a = triangle[j]!
      const b = triangle[(j + 1) % 3]!
      const aInside = distances[a]! >= 0
      const bInside = distances[b]! >= 0
      if (aInside) polygon.push(a)
      if (aInside !== bInside) polygon.push(intersect(a, b))
    }
    // A clipped triangle is empty, a triangle, or a convex quad. Preserve winding.
    for (let j = 1; j + 1 < polygon.length; j++) {
      indices.push(polygon[0]!, polygon[j]!, polygon[j + 1]!)
    }
  }

  return {
    ...mesh,
    positions: new Float32Array(positions),
    normals: normals ? new Float32Array(normals) : null,
    uvs: uvs ? new Float32Array(uvs) : null,
    colors: colors ? new Float32Array(colors) : null,
    indices: new Uint32Array(indices),
  }
}
