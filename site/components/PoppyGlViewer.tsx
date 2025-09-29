import React, {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  computeWorldAABB,
  createSceneFromGLTF,
  renderDrawCalls,
  type BitmapLike,
  type DrawCall,
} from "../../lib"
import type { GLTFResources } from "../../lib"
import { mat4 } from "gl-matrix"

const DEFAULT_WIDTH = 480
const DEFAULT_HEIGHT = 360
const DEFAULT_ORBIT = {
  theta: Math.PI * 0.35,
  phi: Math.PI * 0.35,
} as const

interface OrbitState {
  theta: number
  phi: number
}

interface SceneState {
  drawCalls: DrawCall[]
  center: readonly [number, number, number]
  radius: number
  isImage: boolean
}

interface PoppyGlViewerProps {
  gltfUrl?: string
  pngUrl?: string
  width?: number
  height?: number
  className?: string
  style?: CSSProperties
  showLoadingOverlay?: boolean
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function decodeBase64DataUri(uri: string): Uint8Array {
  const match = uri.match(/^data:(.*?);base64,(.*)$/)
  if (!match) throw new Error(`Unsupported data URI: ${uri.slice(0, 40)}...`)
  const base64 = match[2]!
  const atobFn = typeof globalThis.atob === "function" ? globalThis.atob : null
  if (!atobFn)
    throw new Error("Base64 decoding unavailable in this environment")
  const binary = atobFn(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    if (!src.startsWith("data:")) img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = (event) => reject(event)
    img.src = src
  })
}

function imageElementToBitmap(img: HTMLImageElement): BitmapLike {
  const width = img.naturalWidth || img.width
  const height = img.naturalHeight || img.height
  if (!(width && height)) throw new Error("Image has zero dimensions")
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("Unable to get 2d context for image decoding")
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, width, height)
  return {
    width,
    height,
    data: new Uint8ClampedArray(imageData.data),
  }
}

async function bitmapFromUrl(url: string): Promise<BitmapLike> {
  const img = await loadImageElement(url)
  return imageElementToBitmap(img)
}

async function bitmapFromBinary(
  buffer: Uint8Array,
  mimeType?: string,
): Promise<BitmapLike> {
  const source = buffer.buffer as ArrayBuffer
  const slice = source.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  )
  const blob = new Blob([slice], { type: mimeType ?? "image/png" })
  const objectUrl = URL.createObjectURL(blob)
  try {
    return await bitmapFromUrl(objectUrl)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function fetchAsUint8Array(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  const arrayBuffer = await res.arrayBuffer()
  return new Uint8Array(arrayBuffer)
}

async function loadGLTFResourcesFromUrl(
  gltfUrl: string,
): Promise<{ gltf: any; resources: GLTFResources }> {
  const gltfResponse = await fetch(gltfUrl)
  if (!gltfResponse.ok)
    throw new Error(`Failed to fetch GLTF: ${gltfResponse.status}`)
  const gltf = (await gltfResponse.json()) as any
  const baseUrl = new URL(gltfUrl, window.location.href)

  const buffers: Uint8Array[] = await Promise.all(
    (gltf.buffers ?? []).map(async (buffer: any) => {
      if (buffer.uri) {
        if (buffer.uri.startsWith("data:"))
          return decodeBase64DataUri(buffer.uri)
        const resolved = new URL(buffer.uri, baseUrl).href
        return fetchAsUint8Array(resolved)
      }
      throw new Error("Buffers without uri are not supported in this viewer")
    }),
  )

  const images = await Promise.all(
    (gltf.images ?? []).map(async (img: any) => {
      if (img.uri) {
        if (img.uri.startsWith("data:")) {
          const decoded = decodeBase64DataUri(img.uri)
          return bitmapFromBinary(decoded, img.mimeType)
        }
        const resolved = new URL(img.uri, baseUrl).href
        return bitmapFromUrl(resolved)
      }

      if (typeof img.bufferView === "number") {
        const bufferView = gltf.bufferViews?.[img.bufferView]
        if (!bufferView)
          throw new Error(`Invalid image bufferView index ${img.bufferView}`)
        if (typeof bufferView.buffer !== "number")
          throw new Error(
            `Image bufferView ${img.bufferView} missing buffer reference`,
          )
        const backing = buffers[bufferView.buffer]
        if (!backing)
          throw new Error(
            `Missing buffer for image bufferView ${img.bufferView}`,
          )
        const byteOffset = bufferView.byteOffset ?? 0
        const byteLength = bufferView.byteLength
        if (typeof byteLength !== "number")
          throw new Error(
            `bufferView ${img.bufferView} missing byteLength for image`,
          )
        const slice = backing
          .subarray(byteOffset, byteOffset + byteLength)
          .slice()
        return bitmapFromBinary(slice, img.mimeType)
      }

      throw new Error(
        "images[*] must declare a uri or bufferView for this viewer",
      )
    }),
  )

  return {
    gltf,
    resources: {
      buffers,
      images,
    },
  }
}

function createQuadForBitmap(bitmap: BitmapLike): DrawCall {
  const aspect = bitmap.width / bitmap.height || 1
  const scaleX = aspect >= 1 ? aspect : 1
  const scaleY = aspect >= 1 ? 1 : 1 / aspect

  const positions = new Float32Array([
    -0.5 * scaleX,
    -0.5 * scaleY,
    0,
    0.5 * scaleX,
    -0.5 * scaleY,
    0,
    0.5 * scaleX,
    0.5 * scaleY,
    0,
    -0.5 * scaleX,
    0.5 * scaleY,
    0,
  ])

  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1])

  const uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0])

  const indices = new Uint32Array([0, 1, 2, 0, 2, 3])
  const model = mat4.create()

  return {
    positions,
    normals,
    uvs,
    indices,
    model,
    material: {
      baseColorFactor: [1, 1, 1, 1],
      baseColorTexture: bitmap,
    },
  }
}

function extractSceneBounds(drawCalls: DrawCall[]) {
  const { min, max } = computeWorldAABB(drawCalls)
  const center: [number, number, number] = [
    0.5 * (min[0]! + max[0]!),
    0.5 * (min[1]! + max[1]!),
    0.5 * (min[2]! + max[2]!),
  ]
  const dx = max[0]! - min[0]!
  const dy = max[1]! - min[1]!
  const dz = max[2]! - min[2]!
  const radius = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz) * 0.5, 0.1)
  return { center, radius }
}

function computeOrbitCamera(
  center: readonly [number, number, number],
  radius: number,
  orbit: OrbitState,
): [number, number, number] {
  const distance = Math.max(radius * 2.5, 0.1)
  const sinPhi = Math.sin(orbit.phi)
  const cosPhi = Math.cos(orbit.phi)
  const cosTheta = Math.cos(orbit.theta)
  const sinTheta = Math.sin(orbit.theta)
  const x = center[0] + distance * sinPhi * cosTheta
  const y = center[1] + distance * cosPhi
  const z = center[2] + distance * sinPhi * sinTheta
  return [x, y, z]
}

export const PoppyGlViewer: React.FC<PoppyGlViewerProps> = ({
  gltfUrl,
  pngUrl,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  className,
  style,
  showLoadingOverlay = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pointerState = useRef({
    dragging: false,
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    startOrbit: DEFAULT_ORBIT,
  })
  const [orbit, setOrbit] = useState<OrbitState>(DEFAULT_ORBIT)
  const [sceneState, setSceneState] = useState<SceneState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const resolvedWidth = Math.max(1, Math.round(width))
  const resolvedHeight = Math.max(1, Math.round(height))

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!gltfUrl && !pngUrl) {
      setError("Provide either gltfUrl or pngUrl to PoppyGlViewer")
      setSceneState(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setSceneState(null)

    async function load() {
      try {
        if (gltfUrl) {
          const { gltf, resources } = await loadGLTFResourcesFromUrl(gltfUrl)
          if (cancelled) return
          const scene = createSceneFromGLTF(gltf, resources)
          const { center, radius } = extractSceneBounds(scene.drawCalls)
          if (!cancelled) {
            setSceneState({
              drawCalls: scene.drawCalls,
              center,
              radius,
              isImage: false,
            })
            setOrbit(DEFAULT_ORBIT)
          }
          return
        }
        if (pngUrl) {
          const resolvedPngUrl = pngUrl.startsWith("http")
            ? pngUrl
            : new URL(pngUrl, window.location.href).href
          const bitmap = await bitmapFromUrl(resolvedPngUrl)
          if (cancelled) return
          const drawCall = createQuadForBitmap(bitmap)
          const { center, radius } = extractSceneBounds([drawCall])
          setSceneState({
            drawCalls: [drawCall],
            center,
            radius,
            isImage: true,
          })
          setOrbit(DEFAULT_ORBIT)
        }
      } catch (err) {
        if (cancelled) return
        const message =
          err instanceof Error ? err.message : "Failed to load resource"
        setError(message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [gltfUrl, pngUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !sceneState) return
    canvas.width = resolvedWidth
    canvas.height = resolvedHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.clearRect(0, 0, resolvedWidth, resolvedHeight)

    const camPos = computeOrbitCamera(
      sceneState.center,
      sceneState.radius,
      orbit,
    )
    const renderResult = renderDrawCalls(sceneState.drawCalls, {
      width: resolvedWidth,
      height: resolvedHeight,
      camPos,
      lookAt: sceneState.center,
      ambient: sceneState.isImage ? 1 : undefined,
      lightDir: sceneState.isImage ? [0, 0, 1] : undefined,
      cull: sceneState.isImage ? false : undefined,
    })

    const srcData =
      renderResult.bitmap.data instanceof Uint8ClampedArray
        ? renderResult.bitmap.data
        : new Uint8ClampedArray(renderResult.bitmap.data)
    const imageData = new ImageData(
      new Uint8ClampedArray(srcData),
      renderResult.bitmap.width,
      renderResult.bitmap.height,
    )
    ctx.putImageData(imageData, 0, 0)
  }, [sceneState, orbit, resolvedWidth, resolvedHeight])

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!sceneState) return
    const canvas = canvasRef.current
    if (!canvas) return
    pointerState.current = {
      dragging: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOrbit: { ...orbit },
    }
    canvas.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const state = pointerState.current
    if (!state.dragging) return
    event.preventDefault()
    const deltaX = event.clientX - state.startX
    const deltaY = event.clientY - state.startY
    const ROTATE_SPEED = 0.005
    setOrbit(() => {
      const newTheta = state.startOrbit.theta - deltaX * ROTATE_SPEED
      const newPhi = clamp(
        state.startOrbit.phi - deltaY * ROTATE_SPEED,
        0.05,
        Math.PI - 0.05,
      )
      return { theta: newTheta, phi: newPhi }
    })
  }

  const endDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const state = pointerState.current
    if (state.dragging && canvas && state.pointerId !== null) {
      try {
        canvas.releasePointerCapture(state.pointerId)
      } catch (err) {
        // ignore if capture already released
        void err
      }
    }
    pointerState.current = {
      dragging: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      startOrbit: DEFAULT_ORBIT,
    }
    setDragging(false)
  }

  const containerStyle = useMemo<CSSProperties>(
    () => ({
      position: "relative",
      width: style?.width ?? resolvedWidth,
      height: style?.height ?? resolvedHeight,
      ...style,
    }),
    [resolvedWidth, resolvedHeight, style],
  )

  return (
    <div className={className} style={containerStyle}>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          touchAction: "none",
          cursor: dragging ? "grabbing" : "grab",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      />
      {showLoadingOverlay && loading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.3)",
            color: "#fff",
            fontSize: "0.9rem",
          }}
        >
          Loading…
        </div>
      )}
      {error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            padding: "1rem",
            textAlign: "center",
            fontSize: "0.85rem",
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}

export default PoppyGlViewer
