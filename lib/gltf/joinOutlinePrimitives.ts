import { mat4 } from "gl-matrix"
import type { DrawCall } from "./types"

// Triangle lists ignore an incomplete trailing triangle in each primitive.
function triangleIndexCount(call: DrawCall) {
  const count = call.indices?.length ?? call.positions.length / 3
  return count - (count % 3)
}

function joinTriangles(primitives: DrawCall[]): DrawCall {
  const offsets = new Map<Float32Array, number>()
  let vertexCount = 0
  let indexCount = 0
  for (const primitive of primitives) {
    const { positions } = primitive
    if (!offsets.has(positions)) {
      offsets.set(positions, vertexCount)
      vertexCount += positions.length / 3
    }
    indexCount += triangleIndexCount(primitive)
  }

  const positions = new Float32Array(vertexCount * 3)
  for (const [buffer, offset] of offsets) positions.set(buffer, offset * 3)
  const indices = new Uint32Array(indexCount)
  let cursor = 0
  for (const primitive of primitives) {
    const base = offsets.get(primitive.positions)!
    const count = triangleIndexCount(primitive)
    for (let i = 0; i < count; i++)
      indices[cursor++] = base + (primitive.indices?.[i] ?? i)
  }
  return {
    positions,
    indices,
    normals: null,
    uvs: null,
    model: primitives[0]!.model,
    material: primitives[0]!.material,
  }
}

/** Collect the triangles of each placed mesh for monochrome outline rendering.
 * glTF primitives can reference independent position and index buffers. */
export function joinOutlinePrimitives(calls: DrawCall[]): DrawCall[] {
  if (!calls.some((call) => call.meshInstance)) return calls
  const groups = new Map<object, DrawCall[][]>()
  const ordered: DrawCall[][] = []
  for (const call of calls) {
    const instance = call.meshInstance
    if (
      !instance ||
      (call.mode != null && call.mode !== 4) ||
      call.outlineSectionCap
    ) {
      ordered.push([call])
      continue
    }
    let placements = groups.get(instance)
    if (!placements) {
      placements = []
      groups.set(instance, placements)
    }
    // Adapters can copy placement matrices or move individual primitives.
    const group = placements.find(([first]) =>
      mat4.exactEquals(first!.model, call.model),
    )
    if (group) {
      group.push(call)
    } else {
      const batch = [call]
      placements.push(batch)
      ordered.push(batch)
    }
  }
  return ordered.map((group) =>
    group.length === 1 ? group[0]! : joinTriangles(group),
  )
}
