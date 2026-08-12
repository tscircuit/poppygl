import type { DrawCall } from "./types"

const DEFAULT_CREASE_ANGLE_DEGREES = 30

type Normal = readonly [number, number, number]

interface EdgeRecord {
  indices: readonly [number, number]
  normals: Normal[]
}

function positionKey(positions: Float32Array, index: number): string {
  return `${positions[index * 3 + 0]},${positions[index * 3 + 1]},${positions[index * 3 + 2]}`
}

function triangleNormal(
  positions: Float32Array,
  i0: number,
  i1: number,
  i2: number,
): Normal | null {
  const ax = positions[i1 * 3 + 0]! - positions[i0 * 3 + 0]!
  const ay = positions[i1 * 3 + 1]! - positions[i0 * 3 + 1]!
  const az = positions[i1 * 3 + 2]! - positions[i0 * 3 + 2]!
  const bx = positions[i2 * 3 + 0]! - positions[i0 * 3 + 0]!
  const by = positions[i2 * 3 + 1]! - positions[i0 * 3 + 1]!
  const bz = positions[i2 * 3 + 2]! - positions[i0 * 3 + 2]!
  const nx = ay * bz - az * by
  const ny = az * bx - ax * bz
  const nz = ax * by - ay * bx
  const length = Math.hypot(nx, ny, nz)
  if (length === 0) return null
  return [nx / length, ny / length, nz / length]
}

function addEdge(
  edges: Map<string, EdgeRecord>,
  positions: Float32Array,
  i0: number,
  i1: number,
  normal: Normal | null,
) {
  const key0 = positionKey(positions, i0)
  const key1 = positionKey(positions, i1)
  const isForward = key0 < key1
  const key = isForward ? `${key0}|${key1}` : `${key1}|${key0}`
  const indices = isForward ? ([i0, i1] as const) : ([i1, i0] as const)
  const existing = edges.get(key)
  if (existing) {
    if (normal) existing.normals.push(normal)
  } else {
    edges.set(key, { indices, normals: normal ? [normal] : [] })
  }
}

function hasCrease(normals: Normal[], minimumDot: number): boolean {
  if (normals.length < 2) return true
  for (let i = 0; i < normals.length; i++) {
    for (let j = i + 1; j < normals.length; j++) {
      const a = normals[i]!
      const b = normals[j]!
      const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
      if (dot < minimumDot) return true
    }
  }
  return false
}

/**
 * Builds a line draw call from the boundary and crease edges of a triangle
 * mesh. Vertices are welded by position so glTF meshes that duplicate vertices
 * for normals or UV seams do not produce coplanar triangulation lines.
 */
export function createEdgeDrawCall(
  mesh: DrawCall,
  creaseAngleDegrees = DEFAULT_CREASE_ANGLE_DEGREES,
): DrawCall | null {
  if (mesh.mode != null && mesh.mode !== 4) return null

  const vertexCount = Math.floor(mesh.positions.length / 3)
  const triangleIndices =
    mesh.indices ?? Uint32Array.from({ length: vertexCount }, (_, i) => i)
  if (triangleIndices.length < 3) return null

  const edges = new Map<string, EdgeRecord>()
  for (let i = 0; i + 2 < triangleIndices.length; i += 3) {
    const i0 = triangleIndices[i]!
    const i1 = triangleIndices[i + 1]!
    const i2 = triangleIndices[i + 2]!
    const normal = triangleNormal(mesh.positions, i0, i1, i2)
    addEdge(edges, mesh.positions, i0, i1, normal)
    addEdge(edges, mesh.positions, i1, i2, normal)
    addEdge(edges, mesh.positions, i2, i0, normal)
  }

  const minimumDot = Math.cos((creaseAngleDegrees * Math.PI) / 180)
  const edgeIndices: number[] = []
  for (const edge of edges.values()) {
    if (!hasCrease(edge.normals, minimumDot)) continue
    edgeIndices.push(edge.indices[0], edge.indices[1])
  }
  if (edgeIndices.length === 0) return null

  return {
    positions: mesh.positions,
    normals: null,
    uvs: null,
    indices: new Uint32Array(edgeIndices),
    model: mesh.model,
    material: {
      baseColorFactor: [0, 0, 0, 1],
      baseColorTexture: null,
      alphaMode: "BLEND",
    },
    mode: 1,
  }
}
