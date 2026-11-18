import {
  loadClassicF1,
  renderClassicF1,
} from "../tests/fixtures/classic-f1-outline"

const scene = await loadClassicF1()
const durations: number[] = []
for (let sample = 0; sample < 4; sample++) {
  const start = performance.now()
  renderClassicF1(scene)
  const duration = (performance.now() - start) / 1000
  console.log(
    `sample=${sample} duration=${duration.toFixed(3)}s${sample === 0 ? " warmup" : ""}`,
  )
  if (sample) durations.push(duration)
}
durations.sort((a, b) => a - b)
console.log(
  `P50 duration=${durations[1]!.toFixed(3)}s P95 duration=${durations[2]!.toFixed(3)}s avg duration=${(durations.reduce((sum, duration) => sum + duration, 0) / durations.length).toFixed(3)}s`,
)
