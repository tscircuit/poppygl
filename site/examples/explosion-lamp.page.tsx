import { useEffect, useRef, useState } from "react"
import { renderDrawCalls } from "../../lib"
import {
  createLampDrawCalls,
  lampRenderOptions,
} from "../../tests/fixtures/reference-lamp"

export default function ExplosionLamp() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [exploded, setExploded] = useState(true)
  const [guides, setGuides] = useState(true)

  useEffect(() => {
    const { bitmap } = renderDrawCalls(createLampDrawCalls(exploded ? 60 : 0), {
      ...lampRenderOptions,
      supersampling: 1,
      explosionLines:
        exploded && guides
          ? [-1, 1].map((side) => ({
              points: [
                [side * 36, 68, 0],
                [side * 36, 128, 0],
              ],
              color: [0.015, 0.04, 0.08],
              dashed: true,
            }))
          : [],
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
  }, [exploded, guides])

  return (
    <main
      style={{
        maxWidth: 760,
        padding: 24,
        fontFamily: "system-ui",
        color: "#18212d",
      }}
    >
      <h1>Lamp explosion guides</h1>
      <p>
        The shade lifts 60 mm. Dashed guides join matching points on its lower
        rim.
      </p>
      <div style={{ display: "flex", gap: 24 }}>
        <label>
          <input
            type="checkbox"
            checked={exploded}
            onChange={(event) => setExploded(event.target.checked)}
          />{" "}
          Lift shade
        </label>
        <label>
          <input
            type="checkbox"
            checked={guides}
            onChange={(event) => setGuides(event.target.checked)}
          />{" "}
          Show dashed guides
        </label>
      </div>
      <canvas
        ref={canvas}
        width={480}
        height={480}
        aria-label={exploded ? "Exploded lamp" : "Assembled lamp"}
        style={{ maxWidth: "100%", height: "auto" }}
      />
      <p>
        Base, stem and bulb stay fixed. Scene coordinates are millimetres with
        +Y up.
      </p>
    </main>
  )
}
