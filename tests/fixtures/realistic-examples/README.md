# Existing examples in realistic mode

Three existing repository models and a refreshed SOIC-8 from the Model CDN,
rendered with `realistic: true`.
`gallery.png` shows the realistic views; each `*-comparison.png` places default
rendering on the left and realistic rendering on the right.

| Example | Original asset |
| --- | --- |
| Arduino Uno fixture | `tests/fixtures/assets/arduino-uno.glb` |
| USB-C PCB | `tests/basics/circuit.gltf` |
| SOIC-8 package | `tests/fixtures/assets/soic8-modelcdn.glb` |
| USB enclosure | `tests/fixtures/assets/enclosure-fdm-box-usb-cutout.glb` |

Each pair uses identical geometry, camera, materials, gamma, floor, and image
size. The original assets are unchanged. The gallery uses a fresh offline copy
of [the SOIC-8 CDN model](https://modelcdn.tscircuit.com/jscad_models/soic8.glb),
retrieved on 2026-10-04; its source URL and hash are recorded in
`tests/fixtures/assets/soic8-modelcdn.json`. The old SOIC-8 had a heavily rounded
body (2,148 position entries); the refreshed chamfered body has 339 entries.
Technical hidden-edge overlays are
disabled in both modes. The SOIC-8 asset has vertex colors but no materials;
its body is given a plastic material and its leads a steel material, and its
Z-up coordinates are rotated to Y-up in both views. Other source materials are
preserved. The large studio floor is added by the example script.

`manifest.json` records source hashes, cameras, rendering options, and measured
render times. These are PoppyGL mode comparisons, not additional Blender parity
references; the NEMA17 fixture remains the Blender reference.

Measured locally using Bun 1.3.2 on macOS ARM64, at 600×600 with 2×
supersampling (1200×1200 internal rendering). Times include rendering and PNG
encoding, exclude model loading/preparation, and are one sequential run per
mode rather than a statistical benchmark. Default mode runs after realistic
mode on the same prepared scene. Performance will vary across machines.

| Example | Default | Realistic | Slowdown |
| --- | ---: | ---: | ---: |
| Arduino Uno fixture | 1.55 s | 30.5 s | 19.7× |
| USB-C PCB | 1.06 s | 21.3 s | 20.1× |
| SOIC-8 package (refreshed CDN) | 0.79 s | 37.3 s | 47.2× |
| USB enclosure | 1.26 s | 26.8 s | 21.3× |

The default mode rasterizes a diffuse view. The realistic mode also builds a
triangle BVH, evaluates geometry visibility/secondary rays for studio lighting
and reflections, and denoises the result. This initial implementation is for
offline images; it is too slow for interactive orbiting at these settings.

`jscad-electronics` is pinned as an example/test development dependency to
0.0.187 (the npm `latest` tag when checked). The additional
`tests/realistic/jscad-electronics.test.ts` generates SOIC-8 geometry directly
from its vanilla API and snapshots both lighting modes. The four gallery
images use the assets above. The integration test also compares the current
JSCAD-generated render to the refreshed CDN asset.

Regenerate the 600×600 images with 2× supersampling:

```sh
bun scripts/realistic-examples.ts
bunx biome format --write tests/fixtures/realistic-examples/manifest.json
```

Run the smaller deterministic visual snapshots:

```sh
bun test tests/realistic/existing-examples.test.ts
```

The Cosmos example `realistic-gallery` provides an immediate default/realistic
toggle using the saved full-size images.

## Regular rendering performance

`regular-speed.json` compares the original renderer at `50371d7` with this
branch at 600×600 with 2× supersampling. It records 20 timed samples per mode
with alternating order after nine warmup renders. Timings exclude model
loading and PNG encoding, and omit the studio floor because the original
near-plane calculation clips large floors. All four PNG outputs are identical
between the two renderers.

| Model | Original median | This branch median | Change |
| --- | ---: | ---: | ---: |
| Arduino Uno fixture | 354.5 ms | 326.4 ms | −7.9% |
| USB-C PCB | 182.6 ms | 148.8 ms | −18.5% |
| Refreshed SOIC-8 | 107.0 ms | 108.5 ms | +1.4% |
| USB enclosure | 188.5 ms | 189.6 ms | +0.6% |

This local run shows no appreciable regular-mode slowdown; timing and JIT
variation prevent treating the apparent improvements as guaranteed speedups.
With `realistic: false`, studio lighting tables, the ray BVH, world-position
buffers, and denoiser buffers are not created. Linear radiance tuples are
allocated only when denoising is enabled.

The library bundle grows from approximately 17.4 KB to 23.3 KB gzipped, so there
is additional download/parsing cost even for regular-mode users. Scenes with a
large floor may render more visible pixels after the near-plane bug fix; those
are deliberately excluded from the identical-output comparison above.

To repeat against a checkout of the original revision using the same installed
dependencies:

```sh
bun scripts/benchmark-regular.ts /path/to/original-checkout regular-speed.json
```
