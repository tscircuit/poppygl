import { execFileSync } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { arch, platform } from "node:os"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { encodePNG, renderDrawCalls } from "../lib"
import {
  EXAMPLES,
  loadLocalDrawCalls,
  prepareExample,
} from "./realistic-examples"
import {
  imageError,
  readNema17Fixture,
  resizeReference,
  sha256,
} from "./nema17-comparison"

const usage = `Usage: ./benchmark-realistic-render.sh [options]
  --output DIR             Results and rendered PNGs (default benchmark-results)
  --size N                 Square output size, an integer divisor of 900 (default 300)
  --runs N                 Measured renders per example (default 3)
  --warmup N               Unmeasured renders per example (default 1)
  --compare baseline.json  Compare timings and Blender parity against a saved run
  --check                  Require >=30% mean time reduction and <=5% MAE/RMSE increase
  --help                   Show this help

Five offline scenes, 2x supersampling. Timings include rendering, BVH/table
setup, denoising, downsampling and PNG encoding, but exclude file loading.
Use the same machine, Bun version and settings for comparable runs.`
const args = process.argv.slice(2)
let output = "benchmark-results",
  size = 300,
  runs = 3,
  warmup = 1
let compare: string | undefined,
  check = false
for (let i = 0; i < args.length; i++) {
  const flag = args[i]!
  if (flag === "--help") {
    console.log(usage)
    process.exit(0)
  }
  if (flag === "--check") {
    check = true
    continue
  }
  const value = args[++i]
  if (!value) throw new Error(`Missing value for ${flag}\n${usage}`)
  if (flag === "--output") output = value
  else if (flag === "--size") size = Number(value)
  else if (flag === "--runs") runs = Number(value)
  else if (flag === "--warmup") warmup = Number(value)
  else if (flag === "--compare") compare = value
  else throw new Error(`Unknown option ${flag}\n${usage}`)
}
if (
  ![size, runs, warmup].every(Number.isInteger) ||
  size < 1 ||
  900 % size ||
  runs < 1 ||
  warmup < 0
)
  throw new Error(
    "Size must divide 900; runs must be positive; warmup must be nonnegative",
  )
if (check && !compare) throw new Error("--check requires --compare")
const root = new URL("../", import.meta.url)
const nema = await readNema17Fixture()
const metadata = {
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: fileURLToPath(root),
  })
    .toString()
    .trim(),
  dirty: Boolean(
    execFileSync("git", ["status", "--porcelain"], { cwd: fileURLToPath(root) })
      .toString()
      .trim(),
  ),
  runtime: Bun.version,
  platform: platform(),
  arch: arch(),
  blenderReferenceSha256: nema.reference.referenceSha256,
  environmentSha256: nema.reference.environmentSha256,
  size,
  supersampling: 2,
  runs,
  warmup,
  timingScope:
    "renderDrawCalls + encodePNG; includes per-render setup, excludes loading",
}
const baseline = compare ? JSON.parse(await readFile(compare, "utf8")) : null
if (baseline)
  for (const key of [
    "size",
    "supersampling",
    "runs",
    "warmup",
    "runtime",
    "platform",
    "arch",
    "blenderReferenceSha256",
    "environmentSha256",
  ] as const)
    if (baseline.metadata[key] !== metadata[key])
      throw new Error(`Baseline ${key} differs; rerun with matching settings`)
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b),
    middle = sorted.length >> 1
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
}
const scenes = []
for (const example of EXAMPLES) {
  const prepared = await prepareExample(example)
  scenes.push({ id: example.id, ...prepared })
}
scenes.push({
  id: "nema17",
  drawCalls: await loadLocalDrawCalls(
    new URL("tests/fixtures/nema17/nema17.glb", root),
  ),
  options: nema.options,
  sourceSha256: sha256(nema.glb),
})
await mkdir(output, { recursive: true })
const results = []
for (const scene of scenes) {
  const options = {
    ...scene.options,
    width: size,
    height: size,
    supersampling: 2,
    realistic: true,
  }
  const previous = baseline?.results.find(
    (r: { id: string }) => r.id === scene.id,
  )
  if (
    baseline &&
    (!previous ||
      previous.sourceSha256 !== scene.sourceSha256 ||
      JSON.stringify(previous.options) !== JSON.stringify(options))
  )
    throw new Error(`${scene.id}: scene or camera differs from baseline`)
  console.log(`${scene.id}: warming up (${warmup}), measuring (${runs})…`)
  const render = async () =>
    encodePNG(renderDrawCalls(scene.drawCalls, options).bitmap)
  for (let i = 0; i < warmup; i++) await render()
  const samplesMs = []
  let png: Uint8Array = new Uint8Array()
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    png = await render()
    samplesMs.push(performance.now() - start)
    console.log(`  sample ${i + 1}: ${(samplesMs.at(-1)! / 1000).toFixed(3)}s`)
  }
  const medianMs = median(samplesMs)
  const blenderError =
    scene.id === "nema17"
      ? imageError(png, resizeReference(nema.blender, size))
      : null
  const result = {
    id: scene.id,
    sourceSha256: scene.sourceSha256,
    options,
    samplesMs,
    medianMs,
    pngSha256: sha256(png),
    blenderError,
  }
  results.push(result)
  await writeFile(resolve(output, `${scene.id}.png`), png)
  console.log(
    `${scene.id}: ${(medianMs / 1000).toFixed(3)}s median${previous ? `, ${(100 * (1 - medianMs / previous.medianMs)).toFixed(1)}% less time` : ""}`,
  )
}
let comparison = null
if (baseline) {
  const perExample = results.map((r) => {
    const before = baseline.results.find((b: { id: string }) => b.id === r.id)
    return {
      id: r.id,
      baselineMs: before.medianMs,
      currentMs: r.medianMs,
      timeReduction: 1 - r.medianMs / before.medianMs,
    }
  })
  const oldError = baseline.results.find(
    (r: { id: string }) => r.id === "nema17",
  ).blenderError
  const error = results.find((r) => r.id === "nema17")!.blenderError!
  const meanTimeReduction =
    perExample.reduce((sum, r) => sum + r.timeReduction, 0) / perExample.length
  const maeIncrease = error.mae / oldError.mae - 1,
    rmseIncrease = error.rmse / oldError.rmse - 1
  comparison = {
    perExample,
    meanTimeReduction,
    maeIncrease,
    rmseIncrease,
    performancePass: meanTimeReduction >= 0.3,
    parityPass: maeIncrease <= 0.05 && rmseIncrease <= 0.05,
  }
  console.log(comparison)
}
await writeFile(
  resolve(output, "results.json"),
  JSON.stringify({ metadata, results, comparison }, null, 2) + "\n",
)
console.log(`Saved ${resolve(output, "results.json")}`)
if (check && (!comparison!.performancePass || !comparison!.parityPass))
  process.exitCode = 1
