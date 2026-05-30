import React, { useEffect, useState } from "react"
import {
  encodePNG,
  renderGLTFToPNGFromURL,
  renderGLTFToPNGFromGLB,
  renderSceneFromGLTF,
  createSceneFromGLTF,
  createUint8Bitmap,
} from "../../lib"

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function parsePngDimensions(png: Uint8Array): {
  width: number
  height: number
} {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  }
}

type CompatState =
  | { status: "running" }
  | {
      status: "done"
      globalsBeforeImport: {
        hasBufferGlobal: boolean
        hasProcessGlobal: boolean
      }
      inMemory: {
        isUint8Array: boolean
        constructorName: string
        length: number
        hasValidPngSignature: boolean
        width: number
        height: number
      }
      url: {
        isUint8Array: boolean
        constructorName: string
        length: number
        hasValidPngSignature: boolean
      }
      glb: {
        isUint8Array: boolean
        constructorName: string
        length: number
        hasValidPngSignature: boolean
      }
    }
  | {
      status: "error"
      message: string
      stack?: string
    }

const renderOptions = {
  width: 96,
  height: 72,
  grid: { size: 8 },
  camPos: [8, 6, 8] as [number, number, number],
  lookAt: [0, 0, 0] as [number, number, number],
}

function hasValidSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false
  return PNG_SIGNATURE.every((v, i) => bytes[i] === v)
}

export default function BrowserCompatPage() {
  const [state, setState] = useState<CompatState>({ status: "running" })

  useEffect(() => {
    const run = async () => {
      try {
        const globalsBeforeImport = {
          hasBufferGlobal: typeof globalThis.Buffer !== "undefined",
          hasProcessGlobal: typeof globalThis.process !== "undefined",
        }

        const emptyGLTF = JSON.stringify({
          asset: { version: "2.0" },
          scenes: [{ nodes: [] }],
          scene: 0,
        })

        const inMemoryScene = createSceneFromGLTF(JSON.parse(emptyGLTF), {
          buffers: [],
          images: [],
        })
        const { bitmap } = renderSceneFromGLTF(
          inMemoryScene,
          renderOptions,
          createUint8Bitmap,
        )
        const inMemoryPng = await encodePNG(bitmap)

        const urlPng = await renderGLTFToPNGFromURL(
          "/tests/basics/soic8.gltf",
          renderOptions,
        )

        const glbResponse = await fetch(
          "/tests/fixtures/assets/arduino-uno.glb",
        )
        const glbBytes = new Uint8Array(await glbResponse.arrayBuffer())
        const glbPng = await renderGLTFToPNGFromGLB(glbBytes, {
          width: 128,
          height: 96,
        })

        const inMemoryDims = parsePngDimensions(inMemoryPng)

        setState({
          status: "done",
          globalsBeforeImport,
          inMemory: {
            isUint8Array: inMemoryPng instanceof Uint8Array,
            constructorName: inMemoryPng.constructor.name,
            length: inMemoryPng.length,
            hasValidPngSignature: hasValidSignature(inMemoryPng),
            width: inMemoryDims.width,
            height: inMemoryDims.height,
          },
          url: {
            isUint8Array: urlPng instanceof Uint8Array,
            constructorName: urlPng.constructor.name,
            length: urlPng.length,
            hasValidPngSignature: hasValidSignature(urlPng),
          },
          glb: {
            isUint8Array: glbPng instanceof Uint8Array,
            constructorName: glbPng.constructor.name,
            length: glbPng.length,
            hasValidPngSignature: hasValidSignature(glbPng),
          },
        })
      } catch (error) {
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })
      }
    }

    run()
  }, [])

  return (
    <main style={{ fontFamily: "monospace", padding: 16 }}>
      <h1>Browser Compatibility Fixture</h1>
      <pre data-testid="compat-state">{JSON.stringify(state, null, 2)}</pre>
    </main>
  )
}
