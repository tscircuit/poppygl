import { glyphAdvanceRatio, glyphLineAlphabet } from "@tscircuit/alphabet"
import { gunzipSync } from "node:zlib"
import { mat4 } from "gl-matrix"
import {
  createSceneFromGLTF,
  createUint8Bitmap,
  renderDrawCalls,
  type BitmapLike,
} from "../../lib"
import { parseGLB } from "../../lib/gltf/parseGLB"

// Original assembled.glb from desk-fidget-counter v6.0.12, release
// 077169c3-6b3a-4b8d-8dbc-c3e4c006252f. Gzip only; geometry is unchanged.
export async function loadClassicF1() {
  const compressed = await Bun.file(
    new URL("./assets/classic-f1-assembled.glb.gz", import.meta.url),
  ).arrayBuffer()
  const glb = gunzipSync(compressed)
  const { gltf, binaryChunk } = parseGLB(new Uint8Array(glb).buffer)
  if (!binaryChunk) throw new Error("Classic F1 fixture has no geometry")
  const scene = createSceneFromGLTF(gltf, {
    buffers: [binaryChunk],
    images: [],
  })
  // Engineering drawings use millimetres; the published GLB uses metres.
  const millimetresFromMetres = mat4.fromScaling(
    mat4.create(),
    [1000, 1000, 1000],
  )
  for (const drawCall of scene.drawCalls)
    drawCall.model = mat4.multiply(
      mat4.create(),
      millimetresFromMetres,
      drawCall.model,
    )
  return scene
}

export function renderClassicF1(
  scene: Awaited<ReturnType<typeof loadClassicF1>>,
) {
  return (
    [
      [0, 300, 0],
      [0, 0, 300],
      [300, 300, 300],
    ] as const
  ).map(
    (camPos) =>
      renderDrawCalls(scene.drawCalls, {
        renderStyle: "outline",
        width: 280,
        height: 280,
        supersampling: 1,
        showHiddenEdges: false,
        camPos,
        up: camPos[1] === 300 && camPos[0] === 0 ? "z-" : "y+",
      }).bitmap,
  )
}

export function outlineComparison(options: {
  bitmaps: BitmapLike[]
  interpolations: number
}) {
  const bitmap = createUint8Bitmap(840, 330)
  bitmap.data.fill(255)
  for (const [column, panel] of options.bitmaps.entries()) {
    for (let y = 0; y < panel.height; y++)
      bitmap.data.set(
        panel.data.subarray(y * panel.width * 4, (y + 1) * panel.width * 4),
        ((y + 50) * bitmap.width + column * panel.width) * 4,
      )
  }
  drawCaption(
    bitmap,
    `CLASSIC F1 - SHADER INTERPOLATIONS: ${options.interpolations}`,
  )
  return bitmap
}

function drawCaption(bitmap: BitmapLike, caption: string) {
  let left = 12
  for (const character of caption) {
    for (const stroke of glyphLineAlphabet[character] ?? []) {
      const steps = Math.max(
        1,
        Math.ceil(
          Math.hypot(stroke.x2 - stroke.x1, stroke.y2 - stroke.y1) * 13,
        ),
      )
      for (let step = 0; step <= steps; step++) {
        const x = Math.round(
          left + (stroke.x1 + ((stroke.x2 - stroke.x1) * step) / steps) * 13,
        )
        const y = Math.round(
          15 + (1 - stroke.y1 - ((stroke.y2 - stroke.y1) * step) / steps) * 13,
        )
        bitmap.data.set([25, 35, 50, 255], (y * bitmap.width + x) * 4)
      }
    }
    left += (glyphAdvanceRatio[character] ?? 0.7) * 13
  }
}
