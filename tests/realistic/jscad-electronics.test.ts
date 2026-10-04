import { expect, test } from "bun:test"
import jscad from "@jscad/modeling"
import {
  convertCSGToThreeGeom,
  getJscadModelForFootprint,
} from "jscad-electronics/vanilla"
import { mat4 } from "gl-matrix"
import { encodePNG, renderDrawCalls, type DrawCall } from "../../lib"
import { EXAMPLES, prepareExample } from "../../scripts/realistic-examples"
import { sideBySide } from "../../scripts/nema17-comparison"
import "../fixtures/preload"

test(
  "latest jscad-electronics SOIC-8 renders with realistic lighting",
  async () => {
    const generated = getJscadModelForFootprint("soic8", jscad)
    const drawCalls: DrawCall[] = generated.geometries.map(
      ({ geom, color }) => {
        const mesh = convertCSGToThreeGeom(geom)
        const positions = Float32Array.from(mesh.getAttribute("position").array)
        const normals = Float32Array.from(mesh.getAttribute("normal").array)
        const index = mesh.getIndex()
        const isBody = color === "#555"
        return {
          positions,
          normals,
          uvs: null,
          indices: index
            ? Uint32Array.from(index.array)
            : Uint32Array.from({ length: positions.length / 3 }, (_, i) => i),
          model: mat4.fromXRotation(mat4.create(), -Math.PI / 2),
          material: {
            baseColorFactor: isBody
              ? [0.025, 0.025, 0.025, 1]
              : [0.65, 0.68, 0.72, 1],
            baseColorTexture: null,
            metallicFactor: isBody ? 0 : 1,
            roughnessFactor: isBody ? 0.55 : 0.22,
            alphaMode: "OPAQUE",
          },
        }
      },
    )
    expect(drawCalls.length).toBeGreaterThan(0)
    // Reuse the gallery's SOIC-8 camera/floor while generating all component
    // geometry directly from the pinned current jscad-electronics dependency.
    const prepared = await prepareExample(EXAMPLES[2])
    drawCalls.push(prepared.drawCalls.at(-1)!)
    const options = {
      ...prepared.options,
      width: 200,
      height: 200,
      supersampling: 1,
    }
    const realistic = await encodePNG(
      renderDrawCalls(drawCalls, { ...options, realistic: true }).bitmap,
    )
    const legacy = await encodePNG(
      renderDrawCalls(drawCalls, { ...options, realistic: false }).bitmap,
    )
    await expect(
      sideBySide(legacy, realistic, ["JSCAD default", "JSCAD realistic"]),
    ).toMatchPngSnapshot(import.meta.path)
  },
  { timeout: 60_000 },
)
