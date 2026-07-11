import { expect, test } from "bun:test"
import { renderGLTFToPNGFromURL } from "../../lib"
import { encodePNGToBuffer, pureImageFactory } from "../../cli"
import { renderGLTFToPNGBuffer } from "../../cli/renderGLTFToPNGBuffer"

const EMPTY_GLTF_JSON = JSON.stringify({
  asset: { version: "2.0" },
  scenes: [],
})

function expectPngSignature(bytes: Uint8Array) {
  expect(bytes[0]).toBe(0x89)
  expect(bytes[1]).toBe(0x50)
  expect(bytes[2]).toBe(0x4e)
  expect(bytes[3]).toBe(0x47)
}

function expectPngBuffer(bytes: Uint8Array, minLength = 0) {
  expect(Buffer.isBuffer(bytes)).toBe(true)
  if (minLength > 0) expect(bytes.length).toBeGreaterThan(minLength)
  expectPngSignature(bytes)
}

function createGLTFFetch() {
  let fetchedURL: string | null = null

  return {
    get fetchedURL() {
      return fetchedURL
    },
    fetchImpl: async (url: string) => {
      fetchedURL = url
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        url: "https://example.test/model.gltf",
        async arrayBuffer() {
          return new TextEncoder().encode(EMPTY_GLTF_JSON).buffer
        },
      }
    },
  }
}

test("node renderGLTFToPNGBuffer keeps supporting filesystem paths", async () => {
  const pngBuffer = await renderGLTFToPNGBuffer("./tests/basics/soic8.gltf", {
    width: 96,
    height: 96,
  })

  expectPngBuffer(pngBuffer, 100)
})

test("universal URL renderer forwards custom fetch", async () => {
  const gltfFetch = createGLTFFetch()

  const png = await renderGLTFToPNGFromURL("https://example.test/model.gltf", {
    width: 16,
    height: 16,
    fetchImpl: gltfFetch.fetchImpl,
  })

  expect(gltfFetch.fetchedURL).toBe("https://example.test/model.gltf")
  expectPngSignature(png)
})

test("node renderGLTFToPNGBuffer accepts GLTF JSON strings", async () => {
  const pngBuffer = await renderGLTFToPNGBuffer(EMPTY_GLTF_JSON, {
    width: 16,
    height: 16,
  })

  expectPngBuffer(pngBuffer)
})

test("encodePNGToBuffer keeps returning a Node Buffer at runtime", async () => {
  const image = pureImageFactory(2, 2)
  const pngBuffer = await encodePNGToBuffer(image)

  expect(pngBuffer).toBeInstanceOf(Uint8Array)
  expectPngBuffer(pngBuffer, 10)
})
