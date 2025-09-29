const MAGIC = 0x46546c67
const JSON_CHUNK_TYPE = 0x4e4f534a
const BIN_CHUNK_TYPE = 0x004e4942

export interface ParsedGLB {
  gltf: any
  binaryChunk: Uint8Array | null
  chunks: Array<{ type: number; data: Uint8Array }>
}

export function parseGLB(arrayBuffer: ArrayBuffer): ParsedGLB {
  const view = new DataView(arrayBuffer)
  const magic = view.getUint32(0, true)
  if (magic !== MAGIC) throw new Error("Invalid GLB header magic.")
  const version = view.getUint32(4, true)
  if (version !== 2) throw new Error(`Unsupported GLB version ${version}.`)
  const length = view.getUint32(8, true)
  const decoder = new TextDecoder()

  let json: any = null
  let binaryChunk: Uint8Array | null = null
  const chunks: Array<{ type: number; data: Uint8Array }> = []
  let offset = 12

  while (offset < length) {
    if (offset + 8 > length) throw new Error("Truncated GLB chunk header.")
    const chunkLength = view.getUint32(offset, true)
    const chunkType = view.getUint32(offset + 4, true)
    offset += 8
    if (offset + chunkLength > length)
      throw new Error("Truncated GLB chunk data.")

    const chunkData = new Uint8Array(arrayBuffer, offset, chunkLength)
    offset += chunkLength

    if (chunkType === JSON_CHUNK_TYPE) {
      json = JSON.parse(decoder.decode(chunkData))
    } else if (chunkType === BIN_CHUNK_TYPE) {
      binaryChunk = chunkData
    } else {
      chunks.push({ type: chunkType, data: chunkData })
    }
  }

  if (!json) throw new Error("GLB file is missing JSON chunk.")

  return { gltf: json, binaryChunk, chunks }
}
