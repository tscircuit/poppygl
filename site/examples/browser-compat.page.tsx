import React, { useEffect, useState } from "react"
import {
  encodePNG,
  renderGLTFToPNGFromURL,
  renderGLTFToPNGFromGLB,
  renderSceneFromGLTF,
  createSceneFromGLTF,
  createUint8Bitmap,
} from "../../lib"

function uint8ArrayToDataUrl(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return `data:image/png;base64,${btoa(binary)}`
}

type CompatState =
  | { status: "running" }
  | {
      status: "done"
      noNodeGlobals: boolean
      renders: {
        inMemory: { dataUrl: string; width: number; height: number }
        fromUrl: { dataUrl: string }
        fromGlb: { dataUrl: string }
      }
    }
  | { status: "error"; message: string }

const GLTF_SOIC8_URL = "https://modelcdn.tscircuit.com/jscad_models/soic8.gltf"

const GLB_SOIC8_URL = "https://modelcdn.tscircuit.com/jscad_models/soic8.glb"

const soic8Options = {
  width: 320,
  height: 240,
  camPos: [8, 6, 8] as [number, number, number],
  lookAt: [0, 0.3, 0] as [number, number, number],
}

export default function BrowserCompatPage() {
  const [state, setState] = useState<CompatState>({ status: "running" })

  useEffect(() => {
    const run = async () => {
      try {
        const noNodeGlobals =
          typeof globalThis.Buffer === "undefined" &&
          typeof globalThis.process === "undefined"

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
          soic8Options,
          createUint8Bitmap,
        )
        const inMemoryPng = await encodePNG(bitmap)
        const dims = new DataView(
          inMemoryPng.buffer,
          inMemoryPng.byteOffset,
          inMemoryPng.byteLength,
        )

        const urlPng = await renderGLTFToPNGFromURL(
          GLTF_SOIC8_URL,
          soic8Options,
        )

        const glbResponse = await fetch(GLB_SOIC8_URL)
        const glbBytes = new Uint8Array(await glbResponse.arrayBuffer())
        const glbPng = await renderGLTFToPNGFromGLB(glbBytes, soic8Options)

        setState({
          status: "done",
          noNodeGlobals,
          renders: {
            inMemory: {
              dataUrl: uint8ArrayToDataUrl(inMemoryPng),
              width: dims.getUint32(16),
              height: dims.getUint32(20),
            },
            fromUrl: { dataUrl: uint8ArrayToDataUrl(urlPng) },
            fromGlb: { dataUrl: uint8ArrayToDataUrl(glbPng) },
          },
        })
      } catch (error) {
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    run()
  }, [])

  return (
    <main
      style={{
        fontFamily: "monospace",
        padding: 24,
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      <h1 style={{ marginBottom: 8 }}>Browser Compatibility Fixture</h1>
      <p style={{ color: "#666", marginTop: 0, fontSize: 14 }}>
        Renders glTF in-browser with no Node.js globals (Buffer, process). Each
        image is a plain Uint8Array PNG encoded via fast-png.
      </p>

      <pre
        data-testid="compat-state"
        style={{
          fontSize: 12,
          background: "#f5f5f5",
          padding: 12,
          borderRadius: 6,
          overflow: "auto",
          marginBottom: 24,
        }}
      >
        {JSON.stringify(state, null, 2)}
      </pre>

      {state.status === "done" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 24,
          }}
        >
          {(
            [
              ["inMemory", "encodePNG (empty scene)"],
              ["fromUrl", "renderGLTFToPNGFromURL (soic8.gltf)"],
              ["fromGlb", "renderGLTFToPNGFromGLB (soic8.glb)"],
            ] as const
          ).map(([key, label]) => {
            const render = state.renders[key]
            return (
              <div key={key}>
                <h3 style={{ marginTop: 0, fontSize: 14 }}>{label}</h3>
                <img
                  src={render.dataUrl}
                  style={{
                    width: "100%",
                    border: "1px solid #ddd",
                    borderRadius: 4,
                  }}
                />
              </div>
            )
          })}
        </div>
      )}

      {state.status === "error" && (
        <pre style={{ color: "red", marginTop: 16 }}>{state.message}</pre>
      )}
    </main>
  )
}
