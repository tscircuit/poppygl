# Realistic rendering benchmark

Install dependencies with `bun install --frozen-lockfile`, then run:

```sh
./benchmark-realistic-render.sh --output benchmark-results/baseline
```

This renders the Arduino fixture, USB-C PCB, current SOIC-8, USB enclosure, and
NEMA17 from committed offline assets. Defaults are 300×300, 2× supersampling,
one warmup and three measured renders per model. File loading is excluded;
rendering, per-render setup, denoising, downsampling, and PNG encoding are timed.
Cached lighting tables are warmed up. Run without other CPU-heavy work.

Each directory contains five rendered PNGs and `results.json` with source
hashes, cameras/settings, revision/runtime, individual timings, medians, and
NEMA17 RGB MAE/RMSE against the downsampled committed Blender Cycles reference.

On a candidate renderer using the same machine/runtime/settings:

```sh
./benchmark-realistic-render.sh \
  --output benchmark-results/candidate \
  --compare benchmark-results/baseline/results.json --check
```

The check requires at least 30% lower render time, averaged equally over each
model's fractional median time reduction, and no more than a 5% relative
increase in either NEMA17 MAE or RMSE against Blender. It does not redefine 5%
as an absolute pixel-error allowance. Baseline scene/settings mismatches fail.
This is a local performance benchmark rather than a hardware-independent CI
timing test. Existing visual snapshots still guard other models' appearance.

Use `--help` for options. `--size 900` checks full-size reference parity;
`--runs 1 --warmup 0` is a quick diagnostic, not the default acceptance run.

## Recorded optimization results

The committed `benchmarks/realistic-baseline.json` and
`benchmarks/realistic-optimized.json` record runs on the same local macOS arm64
machine with Bun 1.3.2 and the defaults above. The clean renderer revisions are
`d444932` (baseline) and `f160565` (optimized). These are measured local results,
not a promise of the same speed on every machine.

| Example | Baseline median | Optimized median | Less render time |
| --- | ---: | ---: | ---: |
| Arduino Uno | 8.168 s | 4.082 s | 50.0% |
| USB-C PCB | 4.714 s | 2.047 s | 56.6% |
| SOIC-8 | 7.494 s | 2.065 s | 72.4% |
| USB enclosure | 7.139 s | 2.600 s | 63.6% |
| NEMA17 | 19.045 s | 4.816 s | 74.7% |

The equally weighted mean time reduction is **63.46%**. All five encoded PNGs
have identical SHA-256 hashes before and after optimization. NEMA17's Blender
error remains MAE **0.0323396514**, RMSE **0.0446260745**, a **0% increase** in
both metrics. `--check` passes both acceptance gates. The NEMA17 visual test also
enforces the 5% MAE/RMSE limits independently of timing hardware.

A separate full-size 900×900 NEMA17 render also matches the committed baseline
PNG byte for byte (SHA-256
`76752c23e05823f0f33628f3719cd9fe25777bf307d940784fb73ac962857e94`).
Its Blender MAE is **0.0316438247** and RMSE **0.0434921388**, unchanged from
the baseline. The full-size regular render and three-panel comparison PNG are
also byte-identical to their committed fixtures.

The optimization packs the existing SAH BVH into Float64 arrays with subtree
escape offsets, avoiding recursive traversal and repeated reciprocal direction
calculations. It preserves primitive order and computes each triangle's normal
once. Lighting reuses spherical lookup coordinates and precomputed rotation
terms, caches repeated secondary-hit irradiance, and skips diffuse rays only
when a fully metallic surface makes their contribution zero. Resolution,
supersampling, contributing lighting sample counts, materials, denoising, and
the Blender reference are unchanged. Regular rendering uses the existing path.
