import { expect, test } from "bun:test"
import jscad from "@jscad/modeling"
import { mat4 } from "gl-matrix"
import {
  convertCSGToThreeGeom,
  getJscadModelForFootprint,
} from "jscad-electronics/vanilla"
import { Color } from "three"
import { encodePNG, renderDrawCalls, type DrawCall } from "../../lib"
import "../fixtures/preload"

const models = [
  "hexbolt_m3_l8mm_nothreads",
  "hexsocketbolt_m3_l6mm_nothreads",
  "sheetmetal_plate_w24mm_l20mm_t1mm",
  "nema17_l39mm",
  "helicalgear16_m1mm_w6mm_ha25deg_right_bore4mm_segments4_turnsegments12",
  "spurgear16_m1mm_w4mm_bore4mm_segments4",
  "wormgear_m1mm_d8mm_l8mm_starts2_left_bore3mm_segments24_turnsegments12",
  "flexscreen30_w16_h10_flex10_p0.5mm_tail2mm_taper3mm_sitsflat",
] as const

for (const modelString of models) {
  test(`registered ${modelString.split("_")[0]} geometry renders synchronously`, async () => {
    const generated = getJscadModelForFootprint(modelString, jscad)
    expect(generated).not.toBeInstanceOf(Promise)
    const drawCalls: DrawCall[] = generated.geometries.map(
      ({ geom, color }) => {
        const mesh = convertCSGToThreeGeom(geom)
        const positions = Float32Array.from(mesh.getAttribute("position").array)
        const normals = Float32Array.from(mesh.getAttribute("normal").array)
        const index = mesh.getIndex()
        const rgb =
          typeof color === "string"
            ? new Color(color).toArray()
            : (color ?? [0.5, 0.5, 0.5])
        return {
          positions,
          normals,
          uvs: null,
          indices: index
            ? Uint32Array.from(index.array)
            : Uint32Array.from({ length: positions.length / 3 }, (_, i) => i),
          model: mat4.create(),
          material: {
            baseColorFactor: [rgb[0]!, rgb[1]!, rgb[2]!, rgb[3] ?? 1],
            baseColorTexture: null,
            metallicFactor: 0.65,
            roughnessFactor: 0.3,
          },
        }
      },
    )
    expect(drawCalls.length).toBeGreaterThan(0)
    expect(drawCalls.every(({ positions }) => positions.length > 0)).toBe(true)
    const rendered = renderDrawCalls(drawCalls, {
      width: 240,
      height: 180,
      up: "z+",
      realistic: true,
      supersampling: 1,
      backgroundColor: "#f0f0f0",
    })
    const png = await encodePNG(rendered.bitmap)
    await expect(png).toMatchPngSnapshot(
      import.meta.path,
      `registered-${modelString.split("_")[0]}`,
    )
  }, 30_000)
}
