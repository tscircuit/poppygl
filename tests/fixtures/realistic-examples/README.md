# Existing examples in realistic mode

Four models already present in this repository, rendered with `realistic: true`.
`gallery.png` shows the realistic views; each `*-comparison.png` places default
rendering on the left and realistic rendering on the right.

| Example | Original asset |
| --- | --- |
| Arduino Uno fixture | `tests/fixtures/assets/arduino-uno.glb` |
| USB-C PCB | `tests/basics/circuit.gltf` |
| SOIC-8 package | `tests/basics/soic8.gltf` |
| USB enclosure | `tests/fixtures/assets/enclosure-fdm-box-usb-cutout.glb` |

Each pair uses identical geometry, camera, materials, gamma, floor, and image
size. The original assets are unchanged. Technical hidden-edge overlays are
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
| SOIC-8 package | 0.59 s | 38.7 s | 65.9× |
| USB enclosure | 1.26 s | 26.8 s | 21.3× |

The default mode rasterizes a diffuse view. The realistic mode also builds a
triangle BVH, evaluates geometry visibility/secondary rays for studio lighting
and reflections, and denoises the result. This initial implementation is for
offline images; it is too slow for interactive orbiting at these settings.

`jscad-electronics` is pinned as an example/test development dependency to
0.0.187 (the npm `latest` tag when checked). The additional
`tests/realistic/jscad-electronics.test.ts` generates SOIC-8 geometry directly
from its vanilla API and snapshots both lighting modes. The four gallery
images continue to use the repository assets above.

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
