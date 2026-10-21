# poppygl

Render GLTF files to PNG images in completely native JavaScript without WebGL/OpenGL.

![NEMA17: regular PoppyGL, realistic PoppyGL, and Blender Cycles reference](docs/images/nema17-comparison.png)

Left to right: regular PoppyGL, PoppyGL with `realistic: true`, and a Blender
Cycles reference. All three views use the same model, camera, and materials.

## Install

```sh
npm install poppygl
```

## Quick start

Give poppygl a `.gltf` or `.glb` URL and it will fetch every referenced buffer/texture, rasterize the scene, and return the PNG as a `Uint8Array`.

```ts
import { renderGLTFToPNGFromURL } from "poppygl"
import { writeFile } from "node:fs/promises"

const png = await renderGLTFToPNGFromURL(
  "https://models.babylonjs.com/DamagedHelmet.glb",
  {
    width: 800,
    height: 600,
    ambient: 0.15,
  },
)

await writeFile("DamagedHelmet.png", png)
```

> The fetch helper relies on the global `fetch` API (present in Node 18+ and modern browsers). Pass a custom `fetchImpl` if you need different transport or caching behaviour.

## Render from an in-memory GLB buffer

Already have the `.glb` bytes (for example, uploaded by a user or read from disk)? Send the buffer straight to `renderGLTFToPNGFromGLB` and receive the PNG as a `Uint8Array`.

```ts
import { readFile } from "node:fs/promises"
import { renderGLTFToPNGFromGLB } from "poppygl"

const glb = await readFile("DamagedHelmet.glb")
const png = await renderGLTFToPNGFromGLB(glb, {
  width: 1024,
  height: 768,
})

await writeFile("DamagedHelmet.png", png)
```

> This helper expects every referenced buffer/image to be embedded in the GLB (the usual single-file package). If the asset links out to external resources, load it with `renderGLTFToPNGFromURL` instead so poppygl can fetch the extras.

## Render options

### Realistic studio rendering

Pass `realistic: true` for studio lighting, metal reflections, and soft shadows.
The default is `false`, which uses the faster diffuse renderer.

```ts
import { readFile, writeFile } from "node:fs/promises"
import { renderGLTFToPNGFromGLB } from "poppygl"

const glb = await readFile("motor.glb")
const png = await renderGLTFToPNGFromGLB(glb, {
  realistic: true,
  width: 900,
  height: 900,
  supersampling: 2,
})

await writeFile("motor.png", png)
```

The same flag works with `renderGLTFToPNGFromURL`, `renderDrawCalls`, and
`renderSceneFromGLTF`. Realistic mode uses a fixed studio lighting preset;
`ambient` and `lightDir` apply to regular rendering. Camera, background, and
output settings work in both modes. A floor must be included in your model
if you want it to receive shadows.

Realistic mode supports base-color textures and scalar glTF metallic/roughness
values. Normal maps, metallic/roughness textures, and custom HDR environments
are not yet supported. Transparent and alpha-cutout surfaces do not cast shadows.

Use realistic mode for saved images. At 600×600 with 2× supersampling, the RP2040
motor-controller benchmark takes 2.26–5.49 seconds per warm render across three
views, a 2.11–2.76× speedup over the previous realistic renderer on the same
machine. Blender comparison error increases by at most 0.47%. See
[benchmark results and reproduction steps](BENCHMARK.md#rp2040-motor-controller-500-sample-blender-baseline-and-2-gate).
Render times vary with model complexity and hardware.

### Camera and background

The camera automatically frames the model unless you specify `camPos` and
`lookAt`. Set `up` to match your model's coordinate system:

```ts
const png = await renderGLTFToPNGFromGLB(glb, {
  realistic: true,
  width: 800,
  height: 600,
  camPos: [80, 60, 80],
  lookAt: [0, 0, 0],
  up: "y+",
  fov: 45,
  backgroundColor: "#e5e7eb",
  grid: false,
})
```

### Options

`renderGLTFToPNGFromURL` accepts the same render options as the lower-level APIs:

- `realistic`: enable studio lighting, reflections, and soft shadows (default `false`).
- `width`/`height`: output resolution in pixels (defaults `800`/`600`).
- `supersampling`: render at `width * supersampling` / `height * supersampling`, then downsample (default `1`).
- `fov`: vertical field of view in degrees (default `60`).
- `camPos` and `lookAt`: override the auto-framed camera position and target.
- `up`: choose the world-up axis for the camera with `"y+" | "y-" | "x+" | "x-" | "z+" | "z-"`.
- `cameraRotation`: apply Euler degrees `{ x, y, z }` to define camera orientation directly. When set, it takes precedence over `lookAt`.
- `debugPoints`: optional `{ label, position }[]` overlay rendered on top of the final PNG for world-space debugging markers.
- `debugFontSize`: optional pixel size for `debugPoints` labels; when omitted the renderer derives a size from the image dimensions.
- `debugPointColor`: optional RGB tuple for debug point markers.
- `debugLabelColor`: optional RGB tuple for debug point labels.
- `lightDir`: directional light vector for regular mode (default `[-0.4, -0.9, -0.2]`).
- `ambient`: ambient lighting contribution from 0 to 1 (default `0.15`; regular mode only).
- `gamma`: enable gamma correction (default `true`).
- `cull`: enable back-face culling (default `true`).
- `backgroundColor`: a hex string such as `"#e5e7eb"`, or an RGB tuple with values from 0 to 1.
- `grid`: show a ground grid (default `false`), or provide grid options.
- `showEdges`: draw visible boundary and crease edges on all triangle meshes (default `false`).
- `showHiddenEdges`: draw visible edges plus faint dashed occluded edges on all meshes. Omit it or use `null` to preserve each model's flag; `false` disables those flags.
- `edgeWidth`: width of both visible and hidden mesh edges in output pixels (default `1`).
- `lineWidth`: width of glTF `LINES`, finite grid lines, and explosion guides in output pixels (default `1`).
- `hiddenEdgeOpacity`: opacity of dashed occluded mesh edges, from `0` to `1` (default `0.35`).
- `fetchImpl`: optional override for resource loading (must match the `fetch` signature).

You can inspect the defaults via `getDefaultRenderOptions()` or reuse the internal merge logic with `resolveRenderOptions()`.

### Thicker edges and hidden geometry

Enable edges directly when rendering an ordinary glTF or GLB, without editing its metadata:

```ts
const png = await renderGLTFToPNGFromGLB(glb, {
  showHiddenEdges: true,
  edgeWidth: 2.5,
  hiddenEdgeOpacity: 0.35,
  supersampling: 2,
  backgroundColor: "#ffffff",
})
```

Use `showEdges: true` for solid visible edges alone. Hidden segments use the
scene depth buffer and appear dashed; edge overlays never replace geometry depth.
Boundary and crease edges are extracted from the original triangle geometry,
excluding coplanar triangulation diagonals. Smooth curved silhouettes are not
additional extracted edges.

Widths stay constant in the final image when supersampling changes. Positive,
finite fractional widths are supported; invalid widths fall back to one pixel.
Wider strokes use antialiased screen-space coverage with round caps in the
software renderer. They are clipped before the perspective divide and remain
depth tested across their full width. No GPU or shader runtime is required.
`lineWidth` also applies to ordinary glTF line primitives, finite grid lines,
and explosion guides, including arrowhead strokes. The procedural infinite grid
keeps its existing independent styling.

### Hidden edges for selected sub-models

Set `showHiddenEdges` in a glTF node's `extras` to render that node with solid
visible edges and faint dashed edges where its geometry is occluded:

```json
{
  "nodes": [
    { "name": "Housing", "mesh": 0 },
    {
      "name": "InternalBracket",
      "mesh": 1,
      "extras": { "showHiddenEdges": true }
    }
  ]
}
```

The namespaced form `{ "extras": { "poppygl": { "showHiddenEdges": true } } }`
is also supported. The setting can be placed on a mesh or primitive; primitive
extras take precedence over node extras, which take precedence over mesh extras.
PoppyGL derives boundary and crease edges from triangle geometry, so no line
primitives need to be added to the asset.

## If you already have the GLTF JSON

When the GLTF JSON object is already in memory (for example, bundled with your app), skip the network loader and supply resources directly:

```ts
import {
  bufferFromDataURI,
  createSceneFromGLTF,
  decodeImageFromBuffer,
  encodePNG,
  createUint8Bitmap,
  renderSceneFromGLTF,
} from "poppygl"
import gltfJson from "./CesiumMan.gltf.json" assert { type: "json" }
import { readFile } from "node:fs/promises"

const base = new URL("./CesiumMan/", import.meta.url)

const buffers = await Promise.all(
  (gltfJson.buffers ?? []).map(async (entry) => {
    if (!entry.uri) throw new Error("Buffers without URIs need custom handling.")
    return entry.uri.startsWith("data:")
      ? bufferFromDataURI(entry.uri)
      : await readFile(new URL(entry.uri, base))
  }),
)

const images = await Promise.all(
  (gltfJson.images ?? []).map(async (img) => {
    if (!img.uri) throw new Error("Only URI-backed images are shown in this example.")
    const data = img.uri.startsWith("data:")
      ? bufferFromDataURI(img.uri)
      : await readFile(new URL(img.uri, base))
    return decodeImageFromBuffer(data, img.mimeType)
  }),
)

const scene = createSceneFromGLTF(gltfJson, { buffers, images })
const { bitmap } = renderSceneFromGLTF(scene, { width: 512, height: 512 }, createUint8Bitmap)
const png = await encodePNG(bitmap)
```

The only contract is that `buffers` is an array of `Uint8Array` instances and `images` is an array of `BitmapLike` textures (PNG and JPEG are supported out of the box via `decodeImageFromBuffer`).

## Explosion guide lines

Pass `explosionLines` to any render entrypoint to draw polylines between assembled
and displaced part positions. The caller moves the geometry and supplies the
points in the same glTF scene frame and units (normally right-handed, +Y up).

This lamp is adapted from [core's reference-surface lamp](https://github.com/tscircuit/core/blob/81bef4337570e3ac4d7dd6d30ab63481304e8147/tests/assembly/fixtures/reference-surface-lamp.tsx).
Its base, hollow blue stem, and bulb stay in place while the hollow shade,
mounting collar, and three spokes move together by **+60 mm on scene Y**. The
shade mount moves from Y=92 to Y=152. Two dashed guides join corresponding points
on its lower rim, from Y=68 to Y=128. Arrowheads at the displaced endpoints show
the upward movement:

![Assembled lamp and shade lifted 60 mm with dashed upward arrow guides](tests/render/__snapshots__/explosion-lamp.snap.png)

```ts
// explodedLampGlb already contains the shade translated +60 mm on scene Y.
const rimPoints = [[-36 / Math.SQRT2, 36 / Math.SQRT2], [36, 0]] as const
const png = await renderGLTFToPNGFromGLB(explodedLampGlb, {
  explosionLines: rimPoints.map(([x, z]) => ({
    points: [[x, 68, z], [x, 128, z]],
    color: [0.015, 0.04, 0.08], // Linear RGB, 0..1; optional.
    dashed: true, // Default; false gives a solid guide.
    arrow: true, // Optional; false by default.
  })),
})
```

The deterministic [lamp fixture](tests/fixtures/reference-lamp.ts) and
[visual test](tests/render/explosion-lamp.test.ts) generate the comparison without
network assets. Open the `explosion-lamp` Cosmos example to toggle shade movement,
guides, and arrows interactively. The separate synthetic explosion-lines snapshot
exercises elbows, geometry occlusion, and camera clipping.

Guides respect scene depth, do not write to the depth buffer, and render after
geometry denoising. Their points contribute to automatic camera framing. Lines
are clipped to the camera frustum before rasterization; dash length scales with
supersampling. Omitting the option or passing an empty list preserves the existing
rendering behavior. Each guide needs at least two finite XYZ points.

Set `arrow: true` to draw a solid open arrowhead at the final authored point,
following the final nonzero-length segment's direction. Arrowheads are at most
10 output pixels long, capped for short segments, and scale with supersampling.
They respect scene depth and remain solid when the shaft is dashed. `lineWidth`
controls both the shaft and arrowhead stroke width. Omit `arrow` or set it to
`false` for a guide without an arrow.

## Additional utilities

- `loadGLTFWithResourcesFromURL` returns `{ gltf, resources }` if you prefer to inspect or cache the parsed data before rendering.
- `createSceneFromGLTF` builds draw calls ready for the software rasterizer.
- `computeSmoothNormals` and `computeWorldAABB` expose useful preprocessing helpers.
- `createUint8Bitmap` allocates a portable in-memory bitmap used by the renderer.
- `encodePNG` packs any `BitmapLike` into a `Uint8Array` PNG that can be written to disk or served over the network.

Happy rendering!
