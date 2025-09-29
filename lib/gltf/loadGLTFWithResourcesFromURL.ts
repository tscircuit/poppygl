import type { GLTFResources } from "./types"
import {
  bufferFromDataURI,
  decodeImageFromBuffer,
  isJPG,
  isPNG,
} from "./resourceUtils"
import { parseGLB } from "./parseGLB"

export interface FetchLikeResponse {
  ok: boolean
  status: number
  statusText: string
  url?: string
  arrayBuffer(): Promise<ArrayBuffer>
}

export type FetchLike = (input: string, init?: Record<string, unknown>) => Promise<
  FetchLikeResponse
>

export interface LoadGLTFWithResourcesFromURLOptions {
  fetchImpl?: FetchLike
}

function ensureFetch(fetchImpl?: FetchLike): FetchLike {
  const impl = fetchImpl ?? (globalThis as { fetch?: FetchLike }).fetch
  if (!impl) throw new Error("Global fetch API is not available; provide fetchImpl.")
  return impl
}

async function fetchBinary(
  fetchImpl: FetchLike,
  url: string,
): Promise<Uint8Array> {
  const res = await fetchImpl(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`)
  }
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}

export async function loadGLTFWithResourcesFromURL(
  url: string,
  options: LoadGLTFWithResourcesFromURLOptions = {},
): Promise<{ gltf: any; resources: GLTFResources }> {
  const fetchImpl = ensureFetch(options.fetchImpl)
  const response = await fetchImpl(url)
  if (!response.ok)
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)

  const resolvedURL = new URL(response.url || url)
  const baseURL = resolvedURL
  const sourceBuffer = await response.arrayBuffer()
  const header = sourceBuffer.byteLength >= 4 ? new DataView(sourceBuffer, 0, 4) : null
  const isGLB = header?.getUint32(0, true) === 0x46546c67

  let gltf: any
  const totalBuffers = (): number => (Array.isArray(gltf?.buffers) ? gltf.buffers.length : 0)
  let buffers: Uint8Array[] = []

  if (isGLB) {
    const parsed = parseGLB(sourceBuffer)
    gltf = parsed.gltf
    buffers = new Array(totalBuffers()).fill(null as unknown as Uint8Array)
    if (parsed.binaryChunk) buffers[0] = parsed.binaryChunk
  } else {
    const text = new TextDecoder().decode(new Uint8Array(sourceBuffer))
    gltf = JSON.parse(text)
    buffers = new Array(totalBuffers()).fill(null as unknown as Uint8Array)
  }

  async function resolveBuffer(index: number, entry: any): Promise<Uint8Array> {
    if (buffers[index]) return buffers[index]
    if (entry?.uri) {
      if (entry.uri.startsWith("data:")) {
        const buf = bufferFromDataURI(entry.uri)
        buffers[index] = buf
        return buf
      }
      const resourceURL = new URL(
        decodeURIComponent(entry.uri),
        baseURL,
      ).toString()
      const buf = await fetchBinary(fetchImpl, resourceURL)
      buffers[index] = buf
      return buf
    }
    throw new Error(`Buffer ${index} is missing a uri and no GLB chunk was provided.`)
  }

  await Promise.all(
    (gltf.buffers || []).map(async (entry: any, idx: number) => {
      await resolveBuffer(idx, entry)
    }),
  )

  async function resolveImage(img: any): Promise<ReturnType<typeof decodeImageFromBuffer>> {
    if (img.uri) {
      if (img.uri.startsWith("data:")) {
        const buf = bufferFromDataURI(img.uri)
        return decodeImageFromBuffer(buf, img.mimeType)
      }
      const resourceURL = new URL(
        decodeURIComponent(img.uri),
        baseURL,
      ).toString()
      const hintedMime = img.mimeType
        ? img.mimeType
        : isPNG(img.uri)
          ? "image/png"
          : isJPG(img.uri)
            ? "image/jpeg"
            : null
      const buf = await fetchBinary(fetchImpl, resourceURL)
      return decodeImageFromBuffer(buf, hintedMime)
    }

    if (typeof img.bufferView === "number") {
      const bufferView = gltf.bufferViews?.[img.bufferView]
      if (!bufferView)
        throw new Error(`Invalid image bufferView index ${img.bufferView}`)
      const buffer = await resolveBuffer(bufferView.buffer, gltf.buffers?.[bufferView.buffer])
      if (!buffer)
        throw new Error(`Missing buffer for image bufferView ${img.bufferView}`)
      const byteOffset = bufferView.byteOffset ?? 0
      const byteLength = bufferView.byteLength
      if (typeof byteLength !== "number") {
        throw new Error(
          `bufferView ${img.bufferView} missing byteLength for image.`,
        )
      }
      const slice = buffer.subarray(byteOffset, byteOffset + byteLength)
      return decodeImageFromBuffer(slice, img.mimeType)
    }

    throw new Error(
      "images[*] entry missing uri or bufferView; unsupported in this loader.",
    )
  }

  const images = await Promise.all(
    (gltf.images || []).map((img: any) => resolveImage(img)),
  )

  return {
    gltf,
    resources: {
      buffers,
      images,
    },
  }
}
