import { expect, test } from "bun:test"
import {
  createSceneFromGLTF,
  encodePNG,
  renderDrawCalls,
  renderGLTFToPNGFromGLB,
  renderGLTFToPNGFromURL,
  renderSceneFromGLTF,
  type ExplosionLine,
} from "../../lib"

const lines: ExplosionLine[] = [
  {
    points: [
      [-2, -1, 0],
      [-2, 2, 0],
    ],
    arrow: true,
  },
]
const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0])
const buffer = new Uint8Array(positions.buffer)
const document = {
  asset: { version: "2.0" },
  scene: 1,
  scenes: [
    {
      nodes: [0],
      extras: { poppygl: { explosionLines: [{ points: [[99, 99, 99]] }] } },
    },
    {
      nodes: [0],
      extras: { poppygl: { explosionLines: lines }, unrelated: "retained" },
    },
  ],
  nodes: [{ mesh: 0, translation: [1, 0, -1] }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  buffers: [
    {
      byteLength: buffer.length,
      uri: `data:application/octet-stream;base64,${Buffer.from(buffer).toString("base64")}`,
    },
  ],
  bufferViews: [{ buffer: 0, byteLength: buffer.length }],
  accessors: [{ bufferView: 0, componentType: 5126, type: "VEC3", count: 3 }],
}
const options = {
  width: 160,
  height: 160,
  camPos: [0, 0, 10] as const,
  lookAt: [0, 0, 0] as const,
  backgroundColor: "white",
}

function toGlb(json: unknown) {
  const text = JSON.stringify(json)
  const chunk = new TextEncoder().encode(
    text + " ".repeat((4 - (text.length % 4)) % 4),
  )
  const glb = new Uint8Array(20 + chunk.length)
  const view = new DataView(glb.buffer)
  ;[0x46546c67, 2, glb.length, chunk.length, 0x4e4f534a].forEach((value, i) =>
    view.setUint32(i * 4, value, true),
  )
  glb.set(chunk, 20)
  return glb
}

test("selected-scene extras render like explicit world-space guides without adding geometry", async () => {
  const before = structuredClone(document)
  const scene = createSceneFromGLTF(document, { buffers: [buffer], images: [] })
  expect(scene.drawCalls).toHaveLength(1)
  expect(scene.explosionLines).toEqual(lines)
  const baseline = renderDrawCalls(scene.drawCalls, options)
  const explicit = renderDrawCalls(scene.drawCalls, {
    ...options,
    explosionLines: lines,
  })
  const embedded = renderSceneFromGLTF(scene, options)
  expect(embedded.bitmap.data).toEqual(explicit.bitmap.data)
  expect(embedded.bitmap.data).not.toEqual(baseline.bitmap.data)
  for (const explosionLines of [null, []]) {
    expect(
      renderSceneFromGLTF(scene, { ...options, explosionLines }).bitmap.data,
    ).toEqual(baseline.bitmap.data)
  }
  const replacement: ExplosionLine[] = [
    {
      points: [
        [2, -2, 0],
        [2, 2, 0],
      ],
      dashed: false,
    },
  ]
  expect(
    renderSceneFromGLTF(scene, { ...options, explosionLines: replacement })
      .bitmap.data,
  ).toEqual(
    renderDrawCalls(scene.drawCalls, {
      ...options,
      explosionLines: replacement,
    }).bitmap.data,
  )
  const noExtras = structuredClone(document)
  delete (noExtras.scenes[1] as any).extras
  expect(
    renderSceneFromGLTF(
      createSceneFromGLTF(noExtras, { buffers: [buffer], images: [] }),
      options,
    ).bitmap.data,
  ).toEqual(baseline.bitmap.data)
  const expectedPng = await encodePNG(explicit.bitmap)
  const glb = toGlb(document)
  expect(await renderGLTFToPNGFromGLB(glb, options)).toEqual(expectedPng)
  expect(
    await renderGLTFToPNGFromGLB(glb, { ...options, explosionLines: [] }),
  ).toEqual(await encodePNG(baseline.bitmap))
  for (const [extension, bytes] of [
    ["glb", glb],
    ["gltf", JSON.stringify(document)],
  ] as const) {
    expect(
      await renderGLTFToPNGFromURL(
        `https://example.test/assembly.${extension}`,
        {
          ...options,
          fetchImpl: async () =>
            new Response(bytes, {
              headers: {
                "Content-Type":
                  extension === "glb" ? "model/gltf-binary" : "model/gltf+json",
              },
            }),
        },
      ),
    ).toEqual(expectedPng)
  }
  expect(document).toEqual(before)
})
