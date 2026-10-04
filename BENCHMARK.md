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
