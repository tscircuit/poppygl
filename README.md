# poppygl

Render GLTF files to PNG images in completely native javascript without WebGL/OpenGL

<img width="996" height="732" alt="image" src="https://github.com/user-attachments/assets/5cda4566-2637-440e-8956-dff87aedbc26" />

```tsx
import { renderGLTFToPNGBuffer } from "poppygl/cli"

const gltfPath = "./circuit.gltf" // path to your GLTF file

const pngBuffer = await renderGLTFToPNGBuffer(gltfPath, {
  width: 320,
  height: 240,
})
```
