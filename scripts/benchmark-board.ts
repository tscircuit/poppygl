import { readFile, writeFile, mkdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import { cpus } from "node:os"
import { resolve } from "node:path"
import { parseGLB } from "../lib/gltf/parseGLB"
import { createSceneFromGLTF } from "../lib/gltf/createSceneFromGLTF"
import {
  decodeImageFromBuffer,
  bufferFromDataURI,
} from "../lib/gltf/resourceUtils"
import {
  computeWorldAABB,
  buildCamera,
  renderDrawCalls,
  encodePNG,
} from "../lib"

const [input, output = "board-baseline", sizeArg = "600", runsArg = "5"] =
  process.argv.slice(2)
if (!input)
  throw Error(
    "Usage: bun scripts/benchmark-board.ts board.glb output-dir [size=600] [runs=5]",
  )
const size = Number(sizeArg),
  runs = Number(runsArg)
if (!Number.isInteger(size) || size < 1 || !Number.isInteger(runs) || runs < 1)
  throw Error("Invalid size or runs")
const bytes = await readFile(input)
const { gltf, binaryChunk } = parseGLB(
  bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer,
)
const buffers = (gltf.buffers ?? []).map((b: any) => {
  if (b.uri?.startsWith("data:")) return bufferFromDataURI(b.uri)
  if (b.uri || !binaryChunk) throw Error("GLB must embed all buffers")
  return binaryChunk
})
const images = await Promise.all(
  (gltf.images ?? []).map((img: any) => {
    if (img.uri?.startsWith("data:"))
      return decodeImageFromBuffer(bufferFromDataURI(img.uri), img.mimeType)
    const view = gltf.bufferViews?.[img.bufferView]
    if (!view || img.uri) throw Error("GLB must embed all textures")
    const b = buffers[view.buffer],
      start = view.byteOffset ?? 0
    return decodeImageFromBuffer(
      b.subarray(start, start + view.byteLength),
      img.mimeType,
    )
  }),
)
const { drawCalls } = createSceneFromGLTF(gltf, { buffers, images })
const aabb = computeWorldAABB(drawCalls)
const center = aabb.min.map(
  (v: number, i: number) => (v + aabb.max[i]!) / 2,
) as [number, number, number]
const radius =
  Math.hypot(...aabb.max.map((v: number, i: number) => v - aabb.min[i]!)) / 2
if (!(radius > 0)) throw Error("Empty or degenerate board")
const distance = radius * 3.2
const directions = {
  front: [1, 1.2, 1.5],
  back: [-1, -1.2, 1.5],
  detail: [-1, 1.8, -1],
}
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex")
const envBytes = await readFile(
  new URL("../lib/render/studio-environment.json", import.meta.url),
)
await mkdir(output, { recursive: true })
const metadata = {
  requestedBoardUrl:
    "https://tscircuit.com/imrishabh18/rp2040-motor-controller",
  glbPath: resolve(input),
  glbSha256: hash(bytes),
  environmentSha256: hash(envBytes),
  runtime:
    typeof Bun !== "undefined"
      ? `Bun ${Bun.version}`
      : `Node ${process.version}`,
  cpu: cpus()[0]?.model,
  logicalCpus: cpus().length,
  width: size,
  height: size,
  supersampling: 2,
  warmup: 1,
  runs,
  timingScope:
    "renderDrawCalls and PNG encoding, includes BVH and denoising, excludes scene loading",
  views: [] as any[],
}
for (const [name, dir] of Object.entries(directions)) {
  const norm = Math.hypot(...dir)
  const camPos = center.map((v, i) => v + (dir[i]! / norm) * distance) as [
    number,
    number,
    number,
  ]
  const options = {
    width: size,
    height: size,
    supersampling: 2,
    realistic: true,
    camPos,
    lookAt: center,
    up: "y+" as const,
    fov: 45,
    grid: false,
  }
  const camera = buildCamera(
    drawCalls,
    size * 2,
    size * 2,
    45,
    camPos,
    center,
    "y+",
  )
  // Save the exact matrices rather than reconstructing gl-matrix lookAt in Blender.
  const view = {
    name,
    options,
    viewMatrix: Array.from(camera.view),
    projectionMatrix: Array.from(camera.proj),
    samplesMs: [] as number[],
    pngSha256: "",
    medianMs: 0,
    warmupMs: 0,
  }
  const render = async () =>
    encodePNG(renderDrawCalls(drawCalls, options).bitmap)
  let start = performance.now()
  await render()
  view.warmupMs = performance.now() - start
  console.log(
    `${name} warmup (includes first lighting table setup): ${view.warmupMs.toFixed(1)} ms`,
  )
  for (let i = 0; i < runs; i++) {
    start = performance.now()
    const png = await render()
    view.samplesMs.push(performance.now() - start)
    if (i === 0) {
      await writeFile(resolve(output, `${name}.png`), png)
      view.pngSha256 = hash(png)
    } else if (hash(png) !== view.pngSha256)
      throw Error("Non-deterministic render")
    console.log(`${name} run ${i + 1}: ${view.samplesMs.at(-1)!.toFixed(1)} ms`)
  }
  const sorted = [...view.samplesMs].sort((a, b) => a - b),
    middle = sorted.length >> 1
  view.medianMs =
    sorted.length % 2
      ? sorted[middle]!
      : (sorted[middle - 1]! + sorted[middle]!) / 2
  metadata.views.push(view)
  await writeFile(
    resolve(output, "results.json"),
    JSON.stringify(metadata, null, 2),
  )
}
