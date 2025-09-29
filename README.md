# poppygl

Render GLTF files to PNG images in completely native JavaScript without WebGL/OpenGL.

<img width="996" height="732" alt="image" src="https://github.com/user-attachments/assets/5cda4566-2637-440e-8956-dff87aedbc26" />

## Quick start

Give poppygl a `.gltf` or `.glb` URL and it will fetch every referenced buffer/texture, rasterize the scene, and hand back a PNG buffer.

```ts
import { renderGLTFToPNGBufferFromURL } from "poppygl"
import { writeFile } from "node:fs/promises"

const png = await renderGLTFToPNGBufferFromURL(
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

## Render options

`renderGLTFToPNGBufferFromURL` accepts the same render options as the lower-level APIs:

- `width`/`height` (default `512`): output resolution in pixels.
- `fov`: vertical field of view in degrees (defaults to `35`).
- `camPos` and `lookAt`: override the auto-framed camera position and target.
- `lightDir`: normalized directional light vector (defaults to a top-right key light).
- `ambient`: ambient lighting contribution (0–1, defaults to `0.2`).
- `gamma`: gamma correction applied to the output (defaults to `2.2`).
- `cull`: back-face culling mode (`"back"`, `"front"`, or `"none"`).
- `fetchImpl`: optional override for resource loading (must match the `fetch` signature).

You can inspect the defaults via `getDefaultRenderOptions()` or reuse the internal merge logic with `resolveRenderOptions()`.

## If you already have the GLTF JSON

When the GLTF JSON object is already in memory (for example, bundled with your app), skip the network loader and supply resources directly:

```ts
import {
  bufferFromDataURI,
  createSceneFromGLTF,
  decodeImageFromBuffer,
  encodePNGToBuffer,
  pureImageFactory,
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
const { bitmap } = renderSceneFromGLTF(scene, { width: 512, height: 512 }, pureImageFactory)
const png = await encodePNGToBuffer(bitmap)
```

The only contract is that `buffers` is an array of `Uint8Array` instances and `images` is an array of `BitmapLike` textures (PNG and JPEG are supported out of the box via `decodeImageFromBuffer`).

## Additional utilities

- `loadGLTFWithResourcesFromURL` returns `{ gltf, resources }` if you prefer to inspect or cache the parsed data before rendering.
- `createSceneFromGLTF` builds draw calls ready for the software rasterizer.
- `computeSmoothNormals` and `computeWorldAABB` expose useful preprocessing helpers.
- `pureImageFactory` allocates the `pureimage` bitmap implementation used by the renderer.
- `encodePNGToBuffer` packs any `BitmapLike` into a PNG buffer that can be written to disk or served over the network.

Happy rendering!
