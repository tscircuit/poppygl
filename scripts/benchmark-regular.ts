import { writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { renderDrawCalls, encodePNG } from "../lib"
import { EXAMPLES, prepareExample } from "./realistic-examples"
import { sha256 } from "./nema17-comparison"

// Pass a checkout of the original revision using the same installed runtime
// dependencies. Alternate measured order after warmup to reduce ordering bias.
const baselinePath = process.argv[2]
if (!baselinePath)
  throw new Error("Usage: bun scripts/benchmark-regular.ts BASELINE [OUTPUT]")
const baseline = await import(
  pathToFileURL(resolve(baselinePath, "lib/index.ts")).href
)
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2
}
const results = []
for (const example of EXAMPLES) {
  const scene = await prepareExample(example)
  // Use the actual model without the added studio floor. The baseline's
  // near-plane bug clips large floors and would make that timing unfair.
  const drawCalls = scene.drawCalls.slice(0, -1)
  const options = {
    ...scene.options,
    realistic: false,
    width: 600,
    height: 600,
    supersampling: 2,
  }
  const renderers = [baseline.renderDrawCalls, renderDrawCalls]
  for (let i = 0; i < 8; i++)
    for (const index of i % 2 ? [1, 0] : [0, 1])
      renderers[index]!(drawCalls, options)
  const hashes = []
  for (const renderer of renderers) {
    hashes.push(sha256(await encodePNG(renderer(drawCalls, options).bitmap)))
  }
  if (hashes[0] !== hashes[1])
    throw new Error(`${example.id}: regular output differs from baseline`)
  const times: number[][] = [[], []]
  for (let i = 0; i < 20; i++)
    for (const index of i % 2 ? [1, 0] : [0, 1]) {
      const start = performance.now()
      renderers[index]!(drawCalls, options)
      times[index]!.push(performance.now() - start)
    }
  const baselineMs = median(times[0]!),
    currentMs = median(times[1]!)
  const result = {
    id: example.id,
    baselineMs,
    currentMs,
    changePercent: (currentMs / baselineMs - 1) * 100,
    identicalPNG: true,
    samplesMs: times,
  }
  results.push(result)
  console.log(JSON.stringify(result))
}
if (process.argv[3])
  await writeFile(
    process.argv[3],
    JSON.stringify(
      {
        width: 600,
        height: 600,
        supersampling: 2,
        samplesPerRenderer: 20,
        warmupPerRenderer: 9,
        scope:
          "Rendering only, excludes loading and PNG encoding; no studio floor",
        runtime: Bun.version,
        results,
      },
      null,
      2,
    ) + "\n",
  )
