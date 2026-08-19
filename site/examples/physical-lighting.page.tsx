import { useEffect, useRef, useState } from "react"
import {
  CAD_VIEWER_LIGHTS,
  computeWorldAABB,
  createSceneFromGLTF,
  type DrawCall,
  loadGLTFWithResourcesFromURL,
  type RenderOptionsInput,
  renderDrawCalls,
  srgbDecodeLinear01,
} from "../../lib"
import circuitGltf from "../../tests/basics/circuit.gltf"

const WIDTH = 640
const HEIGHT = 480
const THETA = Math.PI * 0.25
const PHI = Math.PI * 0.3

function hexToLinear(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return [srgbDecodeLinear01(r), srgbDecodeLinear01(g), srgbDecodeLinear01(b)]
}

function camPosFor(
  center: readonly [number, number, number],
  radius: number,
): [number, number, number] {
  const distance = Math.max(radius * 2.5, 0.1)
  const sinPhi = Math.sin(PHI)
  return [
    center[0] + distance * sinPhi * Math.cos(THETA),
    center[1] + distance * Math.cos(PHI),
    center[2] + distance * sinPhi * Math.sin(THETA),
  ]
}

function Slider(props: {
  label: string
  min: number
  max: number
  step: number
  value: number
  format: (v: number) => string
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 150,
        flex: 1,
        opacity: props.disabled ? 0.4 : 1,
      }}
    >
      <span style={{ fontSize: 12, color: "#555" }}>
        {props.label}: {props.format(props.value)}
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        style={{ cursor: props.disabled ? "not-allowed" : "default" }}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </label>
  )
}

function ColorField(props: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 120,
        flex: 1,
      }}
    >
      <span style={{ fontSize: 12, color: "#555" }}>{props.label}</span>
      <input
        type="color"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        style={{
          width: "100%",
          height: 30,
          border: "1px solid #ccc",
          borderRadius: 6,
          padding: 2,
          background: "#fff",
          cursor: "pointer",
        }}
      />
    </label>
  )
}

function Segmented<T extends string>(props: {
  label: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, color: "#555" }}>{props.label}</span>
      <div
        style={{
          display: "flex",
          borderRadius: 6,
          overflow: "hidden",
          border: "1px solid #ccc",
        }}
      >
        {props.options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => props.onChange(option.value)}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              border: "none",
              cursor: "pointer",
              background: props.value === option.value ? "#111" : "#fff",
              color: props.value === option.value ? "#fff" : "#111",
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

interface Scene {
  drawCalls: DrawCall[]
  center: [number, number, number]
  radius: number
}

export default function PhysicalLightingPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [scene, setScene] = useState<Scene | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lighting, setLighting] = useState<"legacy" | "physical">("physical")
  const [toneMapping, setToneMapping] = useState<"none" | "aces">("aces")
  const [exposure, setExposure] = useState(1)
  const [ambientHex, setAmbientHex] = useState("#f6fbf8")
  const [ambientIntensity, setAmbientIntensity] = useState(0.22)
  const [skyHex, setSkyHex] = useState("#e4f1ed")
  const [groundHex, setGroundHex] = useState("#18221d")
  const [hemisphereIntensity, setHemisphereIntensity] = useState(0.2)
  const [keyIntensity, setKeyIntensity] = useState(1.35)
  const [fillIntensity, setFillIntensity] = useState(0.25)
  const [rimIntensity, setRimIntensity] = useState(0.5)
  const [undersideFactor, setUndersideFactor] = useState(0.75)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { gltf, resources } =
          await loadGLTFWithResourcesFromURL(circuitGltf)
        if (cancelled) return
        const { drawCalls } = createSceneFromGLTF(gltf, resources)
        const { min, max } = computeWorldAABB(drawCalls)
        const center: [number, number, number] = [
          (min[0]! + max[0]!) / 2,
          (min[1]! + max[1]!) / 2,
          (min[2]! + max[2]!) / 2,
        ]
        const dx = max[0]! - min[0]!
        const dy = max[1]! - min[1]!
        const dz = max[2]! - min[2]!
        const radius = Math.max(
          Math.sqrt(dx * dx + dy * dy + dz * dz) * 0.5,
          0.1,
        )
        if (!cancelled) setScene({ drawCalls, center, radius })
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !scene) return
    const id = setTimeout(() => {
      canvas.width = WIDTH
      canvas.height = HEIGHT
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const camPos = camPosFor(scene.center, scene.radius)
      const [ambientR, ambientG, ambientB] = hexToLinear(ambientHex)
      const ambientColor: [number, number, number] = [
        ambientR * ambientIntensity,
        ambientG * ambientIntensity,
        ambientB * ambientIntensity,
      ]
      const hemisphere = {
        skyColor: hexToLinear(skyHex),
        groundColor: hexToLinear(groundHex),
        intensity: hemisphereIntensity,
        dir: CAD_VIEWER_LIGHTS.hemisphere.dir,
      }
      const bases = [keyIntensity, fillIntensity, rimIntensity]
      const directionalLights = CAD_VIEWER_LIGHTS.directionalLights.map(
        (dl, i) => ({
          ...dl,
          intensity: (bases[i % 3] ?? 1) * (i < 3 ? 1 : undersideFactor),
        }),
      )

      const options: RenderOptionsInput = {
        width: WIDTH,
        height: HEIGHT,
        fov: 42,
        camPos,
        lookAt: scene.center,
        up: "y+",
        backgroundColor: "#101310",
        ...(lighting === "physical"
          ? {
              toneMapping,
              exposure,
              ambientColor,
              directionalLights,
              hemisphere,
            }
          : { lightDir: [-0.4, -0.9, -0.2], ambient: 0.15 }),
      }

      const { bitmap } = renderDrawCalls(scene.drawCalls, options)
      const data = new Uint8ClampedArray(bitmap.data)
      ctx.putImageData(new ImageData(data, bitmap.width, bitmap.height), 0, 0)
    }, 30)
    return () => clearTimeout(id)
  }, [
    scene,
    lighting,
    toneMapping,
    exposure,
    ambientHex,
    ambientIntensity,
    skyHex,
    groundHex,
    hemisphereIntensity,
    keyIntensity,
    fillIntensity,
    rimIntensity,
    undersideFactor,
  ])

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: 24,
        maxWidth: 1080,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <div style={{ position: "relative", width: WIDTH, height: HEIGHT }}>
          <canvas
            ref={canvasRef}
            style={{
              width: WIDTH,
              height: HEIGHT,
              border: "1px solid #222",
              borderRadius: 8,
              background: "#101310",
            }}
          />
          {!scene && !error && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                background: "rgba(0,0,0,0.4)",
                borderRadius: 8,
              }}
            >
              Loading…
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            flex: 1,
            minWidth: 300,
          }}
        >
          <Segmented
            label="Lighting"
            value={lighting}
            onChange={setLighting}
            options={[
              { value: "legacy", label: "Legacy" },
              { value: "physical", label: "Physical" },
            ]}
          />
          {lighting === "physical" && (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <ColorField
                  label="Ambient"
                  value={ambientHex}
                  onChange={setAmbientHex}
                />
                <Slider
                  label="Ambient"
                  min={0}
                  max={1}
                  step={0.01}
                  value={ambientIntensity}
                  format={(v) => v.toFixed(2)}
                  onChange={setAmbientIntensity}
                />
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <ColorField label="Sky" value={skyHex} onChange={setSkyHex} />
                <ColorField
                  label="Ground"
                  value={groundHex}
                  onChange={setGroundHex}
                />
                <Slider
                  label="Hemisphere"
                  min={0}
                  max={1}
                  step={0.01}
                  value={hemisphereIntensity}
                  format={(v) => v.toFixed(2)}
                  onChange={setHemisphereIntensity}
                />
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Slider
                  label="Key"
                  min={0}
                  max={3}
                  step={0.05}
                  value={keyIntensity}
                  format={(v) => v.toFixed(2)}
                  onChange={setKeyIntensity}
                />
                <Slider
                  label="Fill"
                  min={0}
                  max={3}
                  step={0.05}
                  value={fillIntensity}
                  format={(v) => v.toFixed(2)}
                  onChange={setFillIntensity}
                />
                <Slider
                  label="Rim"
                  min={0}
                  max={3}
                  step={0.05}
                  value={rimIntensity}
                  format={(v) => v.toFixed(2)}
                  onChange={setRimIntensity}
                />
                <Slider
                  label="Underside"
                  min={0}
                  max={1}
                  step={0.01}
                  value={undersideFactor}
                  format={(v) => v.toFixed(2)}
                  onChange={setUndersideFactor}
                />
              </div>
            </>
          )}
          <Segmented
            label="Tone mapping"
            value={toneMapping}
            onChange={setToneMapping}
            options={[
              { value: "none", label: "None" },
              { value: "aces", label: "ACES" },
            ]}
          />
          <Slider
            label="Exposure"
            min={0}
            max={3}
            step={0.05}
            value={exposure}
            format={(v) => v.toFixed(2)}
            disabled={toneMapping === "none"}
            onChange={setExposure}
          />
        </div>
      </div>
      {error && <pre style={{ color: "red" }}>{error}</pre>}
    </main>
  )
}
