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

Regenerate the 600×600 images with 2× supersampling:

```sh
bun scripts/realistic-examples.ts
```

Run the smaller deterministic visual snapshots:

```sh
bun test tests/realistic/existing-examples.test.ts
```

The Cosmos example `realistic-gallery` provides an immediate default/realistic
toggle using the saved full-size images.
