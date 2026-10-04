# NEMA17 reference

This is an original procedural illustration of a NEMA17 motor, not manufacturer
CAD. It has a 42.3 mm body, 31 mm mounting-hole pitch, a 22 mm locating boss,
and a 5 mm D shaft. Meshes include bevels, mounting bores, recessed screw heads,
lamination seams, insulated leads, and a shadow-receiving studio floor.

![PoppyGL regular, PoppyGL realistic, and Blender Cycles](comparison.png)

Left to right: **PoppyGL regular** (`realistic: false`), **PoppyGL realistic**
(`realistic: true`), and **Blender Cycles**. All three views use the same GLB
geometry, camera, and materials. The regular view uses the default diffuse
lighting; the other two use the studio environment.

`nema17.glb` is exported from the same evaluated mesh/material scene rendered by
Blender. `nema17.blend` preserves the reference scene. `blender-cycles.png` is a
900 × 900 Cycles render with 512 samples, fixed seed, denoising, and eight
bounces. Both renderers use Standard/sRGB output with exposure zero, the same
vertical camera FOV, and the analytic studio environment defined in
`lib/render/studio-environment.json`. Camera coordinates are glTF Y-up in
millimetres; the Blender script explicitly converts its Z-up coordinates.

`reference.json` pins the exact GLB, reference PNG, Blender scene, and environment
hashes. The comparison script checks these hashes before rendering. `metrics.json`
records normalized RGB MAE/RMSE against Blender and the default renderer, plus
the full software render's wall-clock time. These image-level numbers supplement
visual inspection; they do not establish exact material or path-tracing parity.

Reproduce from the repository root:

```sh
bun install --frozen-lockfile
blender -b --python scripts/render-nema17-blender.py
bun scripts/nema17-comparison.ts
bunx biome format --write tests/fixtures/nema17/reference.json
bun test tests/realistic
```

Ordinary tests do not invoke Blender or overwrite the reference. They render
the same GLB at 300 × 300 with 2× supersampling, compare a downsampled Cycles
image, and check a separate PNG regression snapshot. Regenerate the Blender
reference deliberately when changing geometry, material definitions, or lighting.

The software renderer uses split-sum IBL and bounded secondary rays. Its rough
reflections, indirect lighting, and shadow sampling differ from Cycles; inspect
the side-by-side for these differences. The model and generated fixtures are
provided under the repository's MIT license.
