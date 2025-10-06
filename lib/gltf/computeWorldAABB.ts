import { vec4 } from "gl-matrix"
import type { DrawCall } from "./types"

export function computeWorldAABB(drawCalls: DrawCall[]) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  const tmp = vec4.create()
  for (const dc of drawCalls) {
    const { positions, model } = dc
    for (let i = 0; i < positions.length; i += 3) {
      vec4.set(tmp, positions[i]!, positions[i + 1]!, positions[i + 2]!, 1)
      vec4.transformMat4(tmp, tmp, model)
      const x = tmp[0]!
      const y = tmp[1]!
      const z = tmp[2]!
      min[0] = Math.min(min[0]!, x)
      min[1] = Math.min(min[1]!, y)
      min[2] = Math.min(min[2]!, z)
      max[0] = Math.max(max[0]!, x)
      max[1] = Math.max(max[1]!, y)
      max[2] = Math.max(max[2]!, z)
    }
  }

  if (!isFinite(min[0])) {
    return {
      min: [-1, -1, -1],
      max: [1, 1, 1],
    }
  }

  return { min, max }
}
