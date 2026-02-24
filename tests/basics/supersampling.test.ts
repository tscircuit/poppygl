import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"
import { renderGLTFToPNGBuffer } from "../../cli/renderGLTFToPNGBuffer"
import { decodeImageFromBuffer } from "../../lib/gltf/resourceUtils"
import { encodePNGToBuffer } from "../../lib/image/encodePNGToBuffer"
import { pureImageFactory } from "../../lib/image/pureImageFactory"
import "../fixtures/preload"

test("supersampling snapshot", async () => {
  const gltfPath = fileURLToPath(new URL("./circuit.gltf", import.meta.url))
  const baseRenderOptions = {
    width: 640,
    height: 480,
    camPos: [15, 15, 15] as const,
    lookAt: [0, 0, 0] as const,
    grid: { size: 10 },
  }

  const supersamplingOffBuffer = await renderGLTFToPNGBuffer(gltfPath, {
    ...baseRenderOptions,
    supersampling: 1,
  })
  const supersampling2Buffer = await renderGLTFToPNGBuffer(gltfPath, {
    ...baseRenderOptions,
    supersampling: 2,
  })

  const supersamplingOffImage = await decodeImageFromBuffer(
    supersamplingOffBuffer,
    "image/png",
  )
  const supersampling2Image = await decodeImageFromBuffer(
    supersampling2Buffer,
    "image/png",
  )

  if (supersamplingOffImage.height !== supersampling2Image.height) {
    throw new Error(
      "Expected matching image heights for supersampling snapshot",
    )
  }

  const mergedImage = pureImageFactory(
    supersamplingOffImage.width + supersampling2Image.width,
    supersamplingOffImage.height,
  )

  const leftRowStride = supersamplingOffImage.width * 4
  const rightRowStride = supersampling2Image.width * 4
  const mergedRowStride = mergedImage.width * 4

  for (let y = 0; y < mergedImage.height; y += 1) {
    const leftSourceStart = y * leftRowStride
    const rightSourceStart = y * rightRowStride
    const mergedRowStart = y * mergedRowStride

    mergedImage.data.set(
      supersamplingOffImage.data.subarray(
        leftSourceStart,
        leftSourceStart + leftRowStride,
      ),
      mergedRowStart,
    )

    mergedImage.data.set(
      supersampling2Image.data.subarray(
        rightSourceStart,
        rightSourceStart + rightRowStride,
      ),
      mergedRowStart + leftRowStride,
    )
  }

  const mergedPngBuffer = await encodePNGToBuffer(mergedImage)

  await expect(mergedPngBuffer).toMatchPngSnapshot(import.meta.path)
})
