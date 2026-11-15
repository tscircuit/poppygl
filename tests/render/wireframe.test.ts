import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { mat4 } from "gl-matrix"
import {
  type DrawCall,
  renderDrawCalls,
  renderGLTFToPNGFromGLB,
  renderGLTFToPNGFromURL,
  resolveRenderOptions,
  SoftwareRenderer,
} from "../../lib"
import "../fixtures/preload"

function createUnitQuadMesh(
  alpha = 1,
  alphaMode: "OPAQUE" | "BLEND" = "OPAQUE",
): DrawCall {
  // Duplicate vertices along the shared diagonal (-1,-1,0) -> (1,1,0) like flat-shaded glTF exports
  return {
    positions: new Float32Array([
      -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0,
    ]),
    normals: null,
    uvs: null,
    indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
    model: mat4.create(),
    material: {
      baseColorFactor: [0.2, 0.8, 1, alpha],
      baseColorTexture: null,
      alphaMode,
    },
  }
}

function createIndexedBox(): DrawCall {
  const p = [
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
  ]
  const positions = new Float32Array(p.flat())
  const indices = new Uint32Array([
    // front (+Z)
    0, 1, 2, 0, 2, 3,
    // back (-Z)
    5, 4, 7, 5, 7, 6,
    // right (+X)
    1, 5, 6, 1, 6, 2,
    // left (-X)
    4, 0, 3, 4, 3, 7,
    // top (+Y)
    3, 2, 6, 3, 6, 7,
    // bottom (-Y)
    4, 5, 1, 4, 1, 0,
  ])
  return {
    positions,
    normals: null,
    uvs: null,
    indices,
    model: mat4.create(),
    material: {
      baseColorFactor: [1, 0.5, 0.1, 1],
      baseColorTexture: null,
      alphaMode: "OPAQUE",
    },
  }
}

function countNonTransparentPixels(
  data: Uint8Array | Uint8ClampedArray,
): number {
  let count = 0
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! > 0) count++
  }
  return count
}

test("resolveRenderOptions supports renderStyle: wireframe and wireframe: true", () => {
  const byStyle = resolveRenderOptions({ renderStyle: "wireframe" })
  const byFlag = resolveRenderOptions({ wireframe: true })

  expect(byStyle.renderStyle).toBe("wireframe")
  expect(byStyle.wireframe).toBe(true)
  expect(byStyle.cull).toBe(false)
  expect(byStyle.realistic).toBe(false)

  expect(byFlag.renderStyle).toBe("wireframe")
  expect(byFlag.wireframe).toBe(true)
  expect(byFlag.cull).toBe(false)

  const explicitCull = resolveRenderOptions({
    renderStyle: "wireframe",
    cull: true,
  })
  expect(explicitCull.cull).toBe(true)

  const backToShaded = resolveRenderOptions({
    ...byFlag,
    renderStyle: "shaded",
  })
  expect(backToShaded.renderStyle).toBe("shaded")
  expect(backToShaded.wireframe).toBe(false)
})

test("wireframe draws triangle edges without filling interior faces and matches shorthand flag", () => {
  const quad = createUnitQuadMesh()
  const baseOptions = {
    width: 129,
    height: 129,
    camPos: [0, 0, 3] as const,
    lookAt: [0, 0, 0] as const,
  }

  const shaded = renderDrawCalls([quad], baseOptions)
  const wireStyle = renderDrawCalls([quad], {
    ...baseOptions,
    renderStyle: "wireframe",
  })
  const wireFlag = renderDrawCalls([quad], {
    ...baseOptions,
    wireframe: true,
  })

  expect(wireFlag.bitmap.data).toEqual(wireStyle.bitmap.data)

  const shadedPixels = countNonTransparentPixels(shaded.bitmap.data)
  const wirePixels = countNonTransparentPixels(wireStyle.bitmap.data)
  expect(wirePixels).toBeGreaterThan(100)
  expect(shadedPixels).toBeGreaterThan(wirePixels * 8)

  // Center of the upper-left triangle (-0.35, +0.35) is filled in shaded mode and transparent in wireframe
  const sampleX = 48
  const sampleY = 48
  const sampleAlphaIndex = (sampleY * 129 + sampleX) * 4 + 3
  expect(shaded.bitmap.data[sampleAlphaIndex]).toBe(255)
  expect(wireStyle.bitmap.data[sampleAlphaIndex]).toBe(0)
})

test("shared triangle edges with duplicated vertices are deduplicated and cull: true hides back faces", () => {
  const translucentQuad = createUnitQuadMesh(0.5, "BLEND")
  const renderer = new SoftwareRenderer(129, 129)
  renderer.clear([0, 0, 0, 0])
  renderer.drawMeshWireframe(
    translucentQuad,
    { view: mat4.create(), proj: mat4.create() },
    false,
    false,
    { width: 5 },
  )

  // Midpoint (64, 64) lies directly on the shared diagonal (-1,-1) -> (1,1).
  // Deduplication ensures alpha 0.5 is blended once (~128), not twice (~191).
  const centerAlpha = renderer.buffer[(64 * 129 + 64) * 4 + 3]!
  expect(centerAlpha).toBeGreaterThanOrEqual(126)
  expect(centerAlpha).toBeLessThanOrEqual(130)

  const box = createIndexedBox()
  const viewOptions = {
    width: 160,
    height: 160,
    camPos: [2.4, 1.9, 3.2] as const,
    lookAt: [0, 0, 0] as const,
    renderStyle: "wireframe" as const,
    lineWidth: 2,
  }
  const seeThrough = renderDrawCalls([box], viewOptions)
  const culled = renderDrawCalls([box], { ...viewOptions, cull: true })

  const allEdgePixels = countNonTransparentPixels(seeThrough.bitmap.data)
  const frontEdgePixels = countNonTransparentPixels(culled.bitmap.data)
  expect(frontEdgePixels).toBeGreaterThan(100)
  expect(allEdgePixels).toBeGreaterThan(frontEdgePixels + 120)
})

test("wireframe clips near-plane straddling triangles cleanly without behind-eye artifacts", () => {
  const straddlingTriangle: DrawCall = {
    positions: new Float32Array([
      -0.8,
      -0.5,
      -2.5,
      0.8,
      -0.5,
      -2.5,
      0,
      0.7,
      1.5, // behind the eye (camera at origin looking down -Z)
    ]),
    normals: null,
    uvs: null,
    indices: new Uint32Array([0, 1, 2]),
    model: mat4.create(),
    material: {
      baseColorFactor: [1, 1, 1, 1],
      baseColorTexture: null,
      alphaMode: "OPAQUE",
    },
  }
  const camera = {
    view: mat4.create(),
    proj: mat4.perspective(mat4.create(), Math.PI / 2, 1, 0.5, 20),
  }

  for (const width of [1, 3]) {
    const renderer = new SoftwareRenderer(128, 128)
    renderer.clear([0, 0, 0, 0])
    const drawnSegments = renderer.drawMeshWireframe(
      straddlingTriangle,
      camera,
      false,
      false,
      { width },
    )
    expect(drawnSegments).toBe(3)
    expect(countNonTransparentPixels(renderer.buffer)).toBeGreaterThan(40)
    expect(Array.from(renderer.buffer).every((v) => Number.isFinite(v))).toBe(
      true,
    )
  }
})

test("wireframe render works end-to-end for GLB bytes and URLs", async () => {
  const glb = new Uint8Array(
    await readFile(
      new URL("../fixtures/assets/soic8-modelcdn.glb", import.meta.url),
    ),
  )
  const options = {
    renderStyle: "wireframe" as const,
    width: 360,
    height: 280,
    supersampling: 2,
    lineWidth: 1.25,
    backgroundColor: "#111827",
  }
  const png = await renderGLTFToPNGFromGLB(glb, options)
  const url = "https://example.test/soic8.glb"
  const fromURL = await renderGLTFToPNGFromURL(url, {
    ...options,
    fetchImpl: async (input) => {
      expect(input).toBe(url)
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        url,
        arrayBuffer: async () =>
          glb.buffer.slice(
            glb.byteOffset,
            glb.byteOffset + glb.byteLength,
          ) as ArrayBuffer,
      }
    },
  })
  expect(fromURL).toEqual(png)
  await expect(png).toMatchPngSnapshot(import.meta.path)
})
