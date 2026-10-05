import { expect, test } from "bun:test"
import { mat4 } from "gl-matrix"
import {
  createUint8Bitmap,
  encodePNG,
  renderDrawCalls,
  SoftwareRenderer,
  type DrawCall,
} from "../../lib"
import { StudioLighting } from "../../lib/render/StudioLighting"
import "../fixtures/preload"

function triangle(
  z: number,
  color: [number, number, number, number],
): DrawCall {
  return {
    positions: new Float32Array([-1.5, -1, 0, 1.5, -1, 0, 0, 1.5, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
    uvs: new Float32Array([0, 0, 1, 0, 0.5, 1]),
    model: mat4.fromTranslation(mat4.create(), [0, 0, z]),
    material: {
      baseColorFactor: color,
      baseColorTexture: null,
      metallicFactor: 0.2,
      roughnessFactor: 0.4,
    },
  }
}

test(
  "opaque triangle IDs survive near-plane clipping",
  async () => {
    const clipped = triangle(0, [0.6, 0.2, 0.1, 1])
    clipped.positions[2] = 2.5
    const draws = [clipped, triangle(-0.1, [0.1, 0.5, 0.2, 1])]
    const result = renderDrawCalls(draws, {
      width: 80,
      height: 80,
      camPos: [0, 0, 2],
      lookAt: [0, 0, 0],
      backgroundColor: "#e5e7eb",
      realistic: true,
    })
    expect(result.bitmap.data).toEqual(immediate(draws, result.camera).data)
    await expect(encodePNG(result.bitmap)).toMatchPngSnapshot(
      import.meta.path,
      "clipped",
    )
  },
  { timeout: 60_000 },
)

// This is the original immediate shading path, independent of the new prepass.
function immediate(
  draws: DrawCall[],
  camera: ReturnType<typeof renderDrawCalls>["camera"],
) {
  const renderer = new SoftwareRenderer(80, 80, createUint8Bitmap, true)
  renderer.clear([229, 231, 235, 255])
  const studio = new StudioLighting(draws, camera)
  for (const mode of ["OPAQUE", "MASK", "BLEND"]) {
    for (const dc of draws.filter(
      (d) => (d.material.alphaMode ?? "OPAQUE") === mode,
    )) {
      if (dc.mode === 1) renderer.drawLines(dc, camera, true)
      else
        renderer.drawMesh(
          dc,
          camera,
          { dir: [-0.4, -0.9, -0.2], ambient: 0.15 },
          dc.material,
          true,
          true,
          studio,
        )
    }
  }
  renderer.denoise(true)
  return renderer.bitmap
}

for (const overlay of ["opaque", "cutout", "blend", "lines"] as const) {
  test(
    `opaque visibility preserves immediate shading with ${overlay}`,
    async () => {
      const behind = triangle(0, [0.5, 0.15, 0.2, 1])
      const front = triangle(0.3, [0.1, 0.45, 0.2, 1])
      const tie = triangle(0.3, [0.05, 0.1, 0.5, 1])
      const textured = triangle(0.6, [0.9, 0.8, 0.5, 1])
      mat4.scale(textured.model, textured.model, [0.6, 0.6, 0.6])
      const texture = createUint8Bitmap(2, 1)
      texture.data.set([128, 255, 0, 0, 255, 128, 32, 255])
      textured.material.baseColorTexture = texture
      textured.material.emissiveTexture = texture
      textured.material.emissiveFactor = [0.05, 0.1, 0.02]
      if (overlay === "cutout") textured.material.alphaMode = "MASK"
      if (overlay === "blend") {
        textured.material.alphaMode = "BLEND"
        textured.material.baseColorFactor[3] = 0.5
      }
      const draws = [behind, front, tie, textured]
      if (overlay === "lines") {
        draws.push({
          ...triangle(0.9, [0.1, 0.1, 0.1, 1]),
          mode: 1,
          indices: new Uint32Array([0, 1, 1, 2]),
        })
      }
      const result = renderDrawCalls(draws, {
        width: 80,
        height: 80,
        camPos: [0.2, 0.3, 5],
        lookAt: [0, 0, 0],
        backgroundColor: "#e5e7eb",
        realistic: true,
      })
      expect(result.bitmap.data).toEqual(immediate(draws, result.camera).data)
      await expect(encodePNG(result.bitmap)).toMatchPngSnapshot(
        import.meta.path,
        overlay,
      )
    },
    { timeout: 60_000 },
  )
}
