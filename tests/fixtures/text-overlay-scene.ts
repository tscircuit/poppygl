import { createSceneFromGLTF, type TextOverlay } from "../../lib"

export const sampleOverlay: TextOverlay = {
  title: "Circuit JSON errors (2)",
  messages: [
    "Trace near R1 violates clearance: minimum 0.2 mm; measured 0.08 mm.",
    "U1 is missing manufacturerPartNumber. Choose a supplier part before ordering this board; this source error has no PCB coordinates and must remain visible in the 3D render.",
  ],
}

export function createTextOverlayScene(overlay: unknown = sampleOverlay) {
  const positions = new Float32Array([
    -2, 0, -1, 2, 0, -1, 2, 0, 1, -2, 0, 1, -2, 1.8, -1, -1.4, 1.8, -1, -1.4,
    1.8, 1, -2, 1.8, 1,
  ])
  const indices = new Uint16Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 4, 7, 0, 7, 3,
  ])
  const buffer = new Uint8Array(positions.byteLength + indices.byteLength)
  buffer.set(new Uint8Array(positions.buffer))
  buffer.set(new Uint8Array(indices.buffer), positions.byteLength)
  const gltf = {
    asset: { version: "2.0" },
    buffers: [
      {
        byteLength: buffer.byteLength,
        uri: `data:application/octet-stream;base64,${btoa(Array.from(buffer, (byte) => String.fromCharCode(byte)).join(""))}`,
      },
    ],
    bufferViews: [
      { buffer: 0, byteLength: positions.byteLength },
      {
        buffer: 0,
        byteOffset: positions.byteLength,
        byteLength: indices.byteLength,
      },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: "VEC3" },
      {
        bufferView: 1,
        componentType: 5123,
        count: indices.length,
        type: "SCALAR",
      },
    ],
    materials: [
      { pbrMetallicRoughness: { baseColorFactor: [0.25, 0.7, 0.45, 1] } },
    ],
    meshes: [
      {
        primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }],
      },
    ],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0], extras: { poppygl: { textOverlay: overlay } } }],
    scene: 0,
  }
  return createSceneFromGLTF(gltf, { buffers: [buffer], images: [] })
}

/** GLB containing embedded data URIs needs only a padded JSON chunk. */
export function toJsonGLB(gltf: unknown): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(gltf))
  const paddedLength = Math.ceil(json.length / 4) * 4
  const glb = new Uint8Array(20 + paddedLength)
  const view = new DataView(glb.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, glb.byteLength, true)
  view.setUint32(12, paddedLength, true)
  view.setUint32(16, 0x4e4f534a, true)
  glb.fill(32, 20)
  glb.set(json, 20)
  return glb
}
