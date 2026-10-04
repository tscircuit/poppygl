import { expect, test } from "bun:test"
import { mat4, vec4 } from "gl-matrix"
import { buildCamera, createSceneFromGLTF, type DrawCall } from "../../lib"
import { RayOcclusion } from "../../lib/render/RayOcclusion"

function triangle(z: number): DrawCall {
  return {
    positions: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
    normals: null,
    uvs: null,
    model: mat4.fromTranslation(mat4.create(), [0, 0, z]),
    material: {
      baseColorFactor: [0.5, 0.5, 0.5, 1],
      baseColorTexture: null,
      metallicFactor: 0,
    },
  }
}

test("visibility and closest reflections respect world transforms and distances", () => {
  const rays = new RayOcclusion([triangle(5), triangle(2)])
  expect(rays.occluded([0, 0, 0], [0, 0, 1], 1)).toBe(false)
  expect(rays.occluded([0, 0, 0], [0, 0, 1], 3)).toBe(true)
  expect(rays.occluded([3, 0, 0], [0, 0, 1])).toBe(false)
  const hit = rays.trace([0, 0, 0], [0, 0, 1])!
  expect(hit.distance).toBeCloseTo(2)
  expect(hit.position).toEqual([0, 0, 2])
  expect(hit.normal[2]).toBe(-1)
})

test("transparent meshes do not become opaque shadow blockers", () => {
  const mesh = triangle(2)
  mesh.material.alphaMode = "BLEND"
  const rays = new RayOcclusion([mesh])
  expect(rays.trace([0, 0, 0], [0, 0, 1])).toBeNull()
})

test("cached traversal keeps parallel axes, finite limits, and hit normals independent", () => {
  // Enough triangles to force internal BVH nodes, with widely separated planes.
  const rays = new RayOcclusion(
    Array.from({ length: 32 }, (_, i) => triangle(i + 2)),
  )
  const front = rays.trace([0, 0, 0], [0, 0, 1])!
  expect(front.distance).toBeCloseTo(2)
  front.normal[2] = 42
  expect(rays.trace([0, 0, 0], [0, 0, 1])!.normal[2]).toBe(-1)
  expect(rays.trace([0, 0, 40], [0, 0, -1])!.distance).toBeCloseTo(7)
  expect(rays.trace([0, 0, 40], [0, 0, -1])!.normal[2]).toBe(1)
  expect(rays.trace([0, 0, 0], [0, 0, 1], 1)).toBeNull()
  expect(rays.trace([3, 0, 0], [0, 0, 1])).toBeNull()
  expect(rays.occluded([0, 0, 0], [0, 1, 0])).toBe(false)
  expect(rays.occluded([0, 0, 0], [1e-14, 0, 1], 3)).toBe(true)
  expect(rays.trace([0, 0, 0], [0, 0, 1])!.distance).toBeCloseTo(2)
})

test("a large studio floor does not clip the nearby subject", () => {
  const ground: DrawCall = {
    ...triangle(0),
    positions: new Float32Array([
      -1000, -2, -1000, 1000, -2, -1000, 0, -2, 1000,
    ]),
  }
  const subject = triangle(0)
  const camera = buildCamera(
    [ground, subject],
    100,
    100,
    40,
    [0, 10, 20],
    [0, 0, 0],
    "y+",
  )
  const clip = vec4.transformMat4(
    vec4.create(),
    [0, 0, 0, 1],
    mat4.multiply(mat4.create(), camera.proj, camera.view),
  )
  expect(clip[2]).toBeGreaterThan(-clip[3])
  expect(clip[2]).toBeLessThan(clip[3])
})

test("glTF metallic/roughness values and specification defaults survive loading", () => {
  const data = new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0])
  const gltf = {
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          { attributes: { POSITION: 0 }, material: 0 },
          { attributes: { POSITION: 0 } },
        ],
      },
    ],
    accessors: [{ bufferView: 0, componentType: 5126, type: "VEC3", count: 3 }],
    bufferViews: [{ buffer: 0, byteLength: data.byteLength }],
    materials: [
      { pbrMetallicRoughness: { metallicFactor: 0.9, roughnessFactor: 0.2 } },
    ],
  }
  const scene = createSceneFromGLTF(gltf as any, {
    buffers: [new Uint8Array(data.buffer)],
    images: [],
  })
  expect(scene.drawCalls[0]!.material.metallicFactor).toBe(0.9)
  expect(scene.drawCalls[0]!.material.roughnessFactor).toBe(0.2)
  expect(scene.drawCalls[1]!.material.metallicFactor).toBe(1)
  expect(scene.drawCalls[1]!.material.roughnessFactor).toBe(1)
})
