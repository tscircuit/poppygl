import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { renderGLTFToPNGFromGLB, renderGLTFToPNGFromURL } from "../../lib"
import "../fixtures/preload"

test("engineering render works for GLB bytes and GLB URLs", async () => {
  const glb = new Uint8Array(
    await readFile(
      new URL(
        "../fixtures/assets/enclosure-fdm-box-usb-cutout.glb",
        import.meta.url,
      ),
    ),
  )
  const options = {
    renderStyle: "engineering" as const,
    width: 360,
    height: 280,
    supersampling: 2,
    showHiddenEdges: true,
    edgeWidth: 1.2,
  }
  const png = await renderGLTFToPNGFromGLB(glb, options)
  const url = "https://example.test/enclosure.glb"
  const fromURL = await renderGLTFToPNGFromURL(url, {
    ...options,
    fetchImpl: async (input) => {
      expect(input).toBe(url)
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        url,
        arrayBuffer: async () =>
          glb.buffer.slice(
            glb.byteOffset,
            glb.byteOffset + glb.byteLength,
          ) as ArrayBuffer,
      }
    },
  })
  expect(fromURL).toEqual(png)
  await expect(png).toMatchPngSnapshot(import.meta.path)
})
