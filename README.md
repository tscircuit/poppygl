# poppygl

Render GLTF files to PNG images in completely native javascript without WebGL/OpenGL

![example image](./tests/basics/__snapshots__/basics01.snap.png)

```tsx
import { renderGLTFToPNGBuffer } from "poppygl"

const gltfPath = "./circuit.gltf" // path to your GLTF file

const pngBuffer = await renderGLTFToPNGBuffer(gltfPath, {
  width: 320,
  height: 240,
})
```
