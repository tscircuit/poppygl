import { useEffect, useRef, useState } from "react"
import { renderDrawCalls } from "../../lib"
import {
  createLampDrawCalls,
  lampRenderOptions,
} from "../../tests/fixtures/reference-lamp"

export default function LampEdgeStyles() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [mode, setMode] = useState("hidden")
  const [width, setWidth] = useState(2.5)

  useEffect(() => {
    const { bitmap } = renderDrawCalls(createLampDrawCalls(), {
      ...lampRenderOptions,
      camPos: [150, 230, 240],
      lookAt: [0, 55, 0],
      fov: 30,
      showEdges: mode !== "shaded",
      showHiddenEdges: mode === "hidden",
      edgeWidth: width,
      hiddenEdgeOpacity: 0.45,
    })
    canvas.current
      ?.getContext("2d")
      ?.putImageData(
        new ImageData(
          new Uint8ClampedArray(bitmap.data),
          bitmap.width,
          bitmap.height,
        ),
        0,
        0,
      )
  }, [mode, width])

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", color: "#18212d" }}>
      <h1>Lamp edge styles</h1>
      <p>Reveal the shade's collar, spokes and internal mounting details.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
        <label>
          Edges{" "}
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            <option value="shaded">Shaded</option>
            <option value="visible">Visible</option>
            <option value="hidden">Visible and hidden</option>
          </select>
        </label>
        <label>
          Width {width} px{" "}
          <input
            type="range"
            min="0.5"
            max="6"
            step="0.5"
            value={width}
            onChange={(event) => setWidth(Number(event.target.value))}
          />
        </label>
      </div>
      <canvas
        ref={canvas}
        width={480}
        height={480}
        aria-label="Lamp with configurable edges"
        style={{ maxWidth: "100%", height: "auto" }}
      />
      <p>
        Visible edges are solid. Occluded edges are faint and dashed. Widths are
        measured in output pixels.
      </p>
    </main>
  )
}
