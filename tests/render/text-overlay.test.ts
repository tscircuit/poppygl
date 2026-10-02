import { expect, test } from "bun:test"
import {
  createSceneFromGLTF,
  getDefaultRenderOptions,
  resolveRenderOptions,
  encodePNG,
  renderDrawCalls,
  renderGLTFToPNGFromGLB,
  renderGLTFToPNGFromURL,
  renderSceneFromGLTF,
  type BitmapLike,
} from "../../lib"
import { renderGLTFToPNGBuffer } from "../../lib/render/renderGLTFToPNGBuffer"
import { renderGLTFToPNGBufferFromGLBBuffer } from "../../lib/render/renderGLTFToPNGBufferFromGLBBuffer"
import { renderGLTFToPNGBufferFromURL } from "../../lib/render/renderGLTFToPNGBufferFromURL"
import {
  createTextOverlayScene,
  sampleOverlay,
  toJsonGLB,
} from "../fixtures/text-overlay-scene"

const options = {
  width: 800,
  height: 600,
  backgroundColor: "#f2f3f5",
  ambient: 1,
}
const footer = (bitmap: BitmapLike) => {
  const top = Array.from({ length: bitmap.height }, (_, y) => y).find((y) => {
    const offset = y * bitmap.width * 4
    return (
      bitmap.data[offset] === 35 &&
      bitmap.data[offset + 1] === 42 &&
      bitmap.data[offset + 2] === 52
    )
  })!
  expect(top).toBeGreaterThan(300)
  return bitmap.data.slice(bitmap.width * top * 4)
}

test("embedded fixed text remains readable and unchanged when the camera orbits", async () => {
  const scene = createTextOverlayScene()
  const before = JSON.stringify(scene.gltf)
  const first = renderSceneFromGLTF(scene, { ...options, camPos: [6, 5, 7] })
  const orbit = renderSceneFromGLTF(scene, { ...options, camPos: [-6, 3, -7] })
  const hidden = renderSceneFromGLTF(scene, {
    ...options,
    camPos: [6, 5, 7],
    textOverlay: null,
  })
  expect(first.camera).toEqual(hidden.camera)
  expect(footer(first.bitmap)).toEqual(footer(orbit.bitmap))
  expect(first.bitmap.data.slice(0, 800 * 250 * 4)).not.toEqual(
    orbit.bitmap.data.slice(0, 800 * 250 * 4),
  )
  expect(JSON.stringify(scene.gltf)).toBe(before)
  await expect(encodePNG(first.bitmap)).toMatchPngSnapshot(
    import.meta.path,
    "text-overlay-first",
  )
  await expect(encodePNG(orbit.bitmap)).toMatchPngSnapshot(
    import.meta.path,
    "text-overlay-orbit",
  )
})

test("font rasterization remains fixed at final pixels when supersampling changes", async () => {
  const scene = createTextOverlayScene()
  const first = renderSceneFromGLTF(scene, { ...options, supersampling: 1 })
  const second = renderSceneFromGLTF(scene, { ...options, supersampling: 2 })
  expect(footer(second.bitmap)).toEqual(footer(first.bitmap))
  await expect(encodePNG(second.bitmap)).toMatchPngSnapshot(
    import.meta.path,
    "text-overlay-supersampling",
  )
})

test("explicit null suppresses metadata and supplied text overrides the selected scene", () => {
  const scene = createTextOverlayScene()
  expect(
    renderSceneFromGLTF(scene, getDefaultRenderOptions()).options.textOverlay,
  ).toEqual(sampleOverlay)
  expect(
    renderSceneFromGLTF(scene, resolveRenderOptions(options)).options
      .textOverlay,
  ).toEqual(sampleOverlay)
  const hidden = renderSceneFromGLTF(scene, { ...options, textOverlay: null })
  const bare = renderDrawCalls(scene.drawCalls, options)
  expect(hidden.bitmap.data).toEqual(bare.bitmap.data)
  expect(hidden.camera).toEqual(bare.camera)
  scene.gltf.scenes.push({
    nodes: [0],
    extras: { poppygl: { textOverlay: { messages: ["Selected scene only"] } } },
  })
  scene.gltf.scene = 1
  expect(renderSceneFromGLTF(scene, options).options.textOverlay).toEqual({
    messages: ["Selected scene only"],
  })
  const override = { title: "Override", messages: ["Caller message"] }
  expect(
    renderSceneFromGLTF(scene, { ...options, textOverlay: override }).bitmap
      .data,
  ).toEqual(
    renderDrawCalls(scene.drawCalls, { ...options, textOverlay: override })
      .bitmap.data,
  )
  delete scene.gltf.scene
  expect(renderSceneFromGLTF(scene, options).options.textOverlay).toEqual(
    sampleOverlay,
  )
})

test("absent, empty, or malformed scene metadata leaves existing output unchanged", () => {
  for (const metadata of [
    undefined,
    null,
    {},
    "message",
    { messages: "wrong" },
    { messages: [1] },
    { title: 1, messages: [] },
    { messages: [] },
  ]) {
    const scene = createTextOverlayScene()
    scene.gltf.scenes[0].extras.poppygl.textOverlay = metadata
    const result = renderSceneFromGLTF(scene, options)
    expect(result.bitmap.data).toEqual(
      renderDrawCalls(scene.drawCalls, options).bitmap.data,
    )
  }
})

test("all GLB and URL entry points inherit embedded overlays and honor explicit suppression", async () => {
  const scene = createTextOverlayScene()
  const glb = toJsonGLB(scene.gltf)
  const expected = await encodePNG(renderSceneFromGLTF(scene, options).bitmap)
  const hidden = await encodePNG(
    renderSceneFromGLTF(scene, { ...options, textOverlay: null }).bitmap,
  )
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    arrayBuffer: async () =>
      new TextEncoder().encode(JSON.stringify(scene.gltf)).buffer,
  })
  for (const render of [
    (opts: typeof options & { textOverlay?: null }) =>
      renderGLTFToPNGFromGLB(glb, opts),
    (opts: typeof options & { textOverlay?: null }) =>
      renderGLTFToPNGFromURL("https://example.test/scene.gltf", {
        ...opts,
        fetchImpl,
      }),
    (opts: typeof options & { textOverlay?: null }) =>
      renderGLTFToPNGBuffer(scene.gltf, opts, {
        buffers: [
          new Uint8Array(
            Buffer.from(scene.gltf.buffers[0].uri.split(",")[1], "base64"),
          ),
        ],
        images: [],
      }),
    (opts: typeof options & { textOverlay?: null }) =>
      renderGLTFToPNGBufferFromGLBBuffer(glb, opts),
    (opts: typeof options & { textOverlay?: null }) =>
      renderGLTFToPNGBufferFromURL("https://example.test/scene.gltf", {
        ...opts,
        fetchImpl,
      }),
  ]) {
    const visible = await render(options)
    const suppressed = await render({ ...options, textOverlay: null })
    // Buffer-based legacy APIs use another PNG encoder; compare decoded pixels.
    const { decode } = await import("fast-png")
    expect(decode(visible).data).toEqual(decode(expected).data)
    expect(decode(suppressed).data).toEqual(decode(hidden).data)
  }
})

test("unlocated multiline text renders without geometry, including punctuation and unsupported characters", async () => {
  const scene = createSceneFromGLTF(
    {
      scenes: [
        {
          nodes: [],
          extras: {
            poppygl: {
              textOverlay: {
                title: "Messages without geometry",
                messages: [
                  "Clearance: 0.2 mm; is this correct?\nValue is 10 Ω.",
                  "a".repeat(110),
                ],
              },
            },
          },
        },
      ],
    },
    { buffers: [], images: [] },
  )
  const result = renderSceneFromGLTF(scene, options)
  expect(result.options.textOverlay!.messages[0]).toContain("Ω")
  expect(result.bitmap.data.some((channel) => channel === 248)).toBe(true)
  await expect(encodePNG(result.bitmap)).toMatchPngSnapshot(
    import.meta.path,
    "text-overlay-empty-scene",
  )
})

test("oversized panels disclose omitted wrapped lines instead of silently losing messages", async () => {
  const result = renderDrawCalls([], {
    ...options,
    height: 180,
    textOverlay: {
      title: "Many messages",
      messages: Array.from(
        { length: 15 },
        (_, index) => `Message ${index + 1}`,
      ),
    },
  })
  await expect(encodePNG(result.bitmap)).toMatchPngSnapshot(
    import.meta.path,
    "text-overlay-overflow",
  )
})
