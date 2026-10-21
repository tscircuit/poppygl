import jscad from "@jscad/modeling"
import type Geom3 from "@jscad/modeling/src/geometries/geom3/type"
import type { generalize as generalizeGeometry } from "@jscad/modeling/src/operations/modifiers/generalize"
import { mat4 } from "gl-matrix"
import {
  computeSmoothNormals,
  type DrawCall,
  type RenderOptionsInput,
} from "../../lib"

const { cylinder, cuboid, sphere } = jscad.primitives
const { subtract, union } = jscad.booleans
const { rotateZ } = jscad.transforms
// The pinned JSCAD type barrel expects a missing default export for generalize.
const generalize = jscad.modifiers
  .generalize as unknown as typeof generalizeGeometry
const segments = 64

/**
 * A deterministic adaptation of tscircuit/core's reference-surface lamp:
 * https://github.com/tscircuit/core/blob/81bef4337570e3ac4d7dd6d30ab63481304e8147/tests/assembly/fixtures/reference-surface-lamp.tsx
 * Part geometry is authored in millimetres, +Z up, then rotated to glTF +Y up.
 * The base top is Y=12; the 80 mm hollow stem puts the shade mount at Y=92.
 */
function lampParts(): {
  geometry: Geom3
  color: [number, number, number, number]
  mountY: number
}[] {
  const base = subtract(
    union(
      cylinder({ radius: 34, height: 8, center: [0, 0, 4], segments }),
      cylinder({ radius: 24, height: 4, center: [0, 0, 10], segments }),
    ),
    cylinder({ radius: 2, height: 14, center: [0, 0, 6], segments }),
    cuboid({ size: [34, 4, 3], center: [17, 0, 1] }),
  )
  const stem = subtract(
    cylinder({ radius: 4, height: 80, center: [0, 0, 40], segments }),
    cylinder({ radius: 2, height: 82, center: [0, 0, 40], segments }),
  )
  const bulb = union(
    cylinder({ radius: 2, height: 8, center: [0, 0, 84], segments }),
    sphere({ radius: 7, center: [0, 0, 88], segments: 32 }),
  )
  const taperedShell = subtract(
    jscad.hulls.hull(
      cylinder({ radius: 36, height: 0.2, center: [0, 0, -23.9], segments }),
      cylinder({ radius: 20, height: 0.2, center: [0, 0, 19.9], segments }),
    ),
    jscad.hulls.hull(
      cylinder({ radius: 34.4, height: 0.2, center: [0, 0, -25], segments }),
      cylinder({ radius: 17.6, height: 0.2, center: [0, 0, 21], segments }),
    ),
  )
  const collar = subtract(
    cylinder({ radius: 7, height: 4, center: [0, 0, 2], segments }),
    cylinder({ radius: 2.2, height: 6, center: [0, 0, 2], segments }),
  )
  const shade = union(
    taperedShell,
    collar,
    ...[0, 120, 240].map((angle) =>
      rotateZ(
        (angle * Math.PI) / 180,
        cuboid({ size: [20, 2, 2], center: [16, 0, 2] }),
      ),
    ),
  )
  return [
    { geometry: base, color: [0.08, 0.12, 0.16, 1], mountY: 0 },
    { geometry: stem, color: [0.26, 0.44, 0.55, 1], mountY: 12 },
    { geometry: bulb, color: [1, 0.9, 0.65, 1], mountY: 12 },
    { geometry: shade, color: [0.85, 0.63, 0.37, 1], mountY: 92 },
  ]
}

// JSCAD's standard export step snaps shared vertices and inserts T-junctions
// before triangulating, so adjacent polygons produce conforming mesh edges.
function toDrawCall({
  geometry,
  color,
  mountY,
}: ReturnType<typeof lampParts>[number]): DrawCall {
  const triangles = generalize({ snap: true, triangulate: true }, geometry)
  const positions: number[] = []
  for (const { vertices } of jscad.geometries.geom3.toPolygons(triangles)) {
    for (const vertex of vertices) positions.push(...vertex)
  }
  const positionArray = Float32Array.from(positions)
  const model = mat4.fromTranslation(mat4.create(), [0, mountY, 0])
  mat4.rotateX(model, model, -Math.PI / 2)
  return {
    positions: positionArray,
    normals: computeSmoothNormals(positionArray, null),
    indices: null,
    uvs: null,
    model,
    material: { baseColorFactor: color, baseColorTexture: null },
  }
}

// Cache deterministic meshes; each call owns its model matrices so moving the
// shade never mutates the assembled scene, base, stem or bulb.
let parts: DrawCall[] | undefined
export function createLampDrawCalls(shadeOffsetY = 0): DrawCall[] {
  parts ??= lampParts().map(toDrawCall)
  return parts.map((part, index) => {
    const model = mat4.clone(part.model)
    if (index === 3) model[13] += shadeOffsetY
    return { ...part, model }
  })
}

/** Same framing for assembled/exploded comparisons, in glTF scene millimetres. */
export const lampRenderOptions: RenderOptionsInput = {
  width: 480,
  height: 480,
  supersampling: 2,
  camPos: [170, 235, 250],
  lookAt: [0, 84, 0],
  fov: 36,
  up: "y+",
  backgroundColor: [1, 1, 1],
  ambient: 0.4,
  lightDir: [-0.6, -0.8, -0.5],
}
