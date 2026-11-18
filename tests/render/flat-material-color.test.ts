import { expect, test } from "bun:test"
import {
  encodePNG,
  renderDrawCalls,
  createUint8Bitmap,
  type Material,
} from "../../lib"
import { mesh } from "../fixtures/outline"
import "../fixtures/preload"

test("constant unlit materials match interpolated surfaces without changing alpha or emission", async () => {
  const materials: Material[] = [
    {
      baseColorFactor: [0.2, 0.6, 0.9, 0.1],
      baseColorTexture: null,
      alphaMode: "OPAQUE",
    },
    {
      baseColorFactor: [0.2, 0.6, 0.9, 0.8],
      baseColorTexture: null,
      alphaMode: "MASK",
    },
    {
      baseColorFactor: [0.2, 0.6, 0.9, 0.3],
      baseColorTexture: null,
      alphaMode: "MASK",
    },
    {
      baseColorFactor: [0.2, 0.6, 0.9, 0.4],
      baseColorTexture: null,
      alphaMode: "BLEND",
    },
    {
      baseColorFactor: [0.2, 0.6, 0.9, 1],
      baseColorTexture: null,
      emissiveFactor: [0.3, 0.1, 0],
    },
  ]
  const snapshot = createUint8Bitmap(640, materials.length * 96)
  for (const [row, material] of materials.entries()) {
    for (const [column, gamma] of [false, true].entries()) {
      const geometry = { ...mesh(), material }
      const renderOptions = {
        width: 160,
        height: 96,
        ambient: 1,
        gamma,
        backgroundColor: "#e8edf3",
        camPos: [4, 3, 6] as const,
      }
      const actual = renderDrawCalls([geometry], renderOptions).bitmap
      // Explicit white vertex colors require interpolation but preserve the
      // material's appearance, providing an independent reference path.
      const reference = renderDrawCalls(
        [
          {
            ...geometry,
            colors: new Float32Array(geometry.positions.length).fill(1),
          },
        ],
        renderOptions,
      ).bitmap
      expect(actual.data).toEqual(reference.data)
      for (const [panelIndex, panel] of [actual, reference].entries())
        for (let y = 0; y < panel.height; y++)
          snapshot.data.set(
            panel.data.subarray(y * panel.width * 4, (y + 1) * panel.width * 4),
            ((row * 96 + y) * snapshot.width +
              (column * 2 + panelIndex) * panel.width) *
              4,
          )
    }
  }
  await expect(encodePNG(snapshot)).toMatchPngSnapshot(import.meta.path)
})
