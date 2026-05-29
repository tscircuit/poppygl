type NodeBufferConstructor = {
  from(
    input: Uint8Array | ArrayBuffer | ArrayBufferView | string,
    encoding?: string,
  ): Buffer
}

function getNodeBuffer(): NodeBufferConstructor {
  const maybeBuffer = (globalThis as { Buffer?: NodeBufferConstructor }).Buffer
  if (!maybeBuffer) {
    throw new Error("Node Buffer API is not available in this runtime.")
  }
  return maybeBuffer
}

export function toUint8Array(
  chunk: Uint8Array | ArrayBuffer | ArrayBufferView,
): Uint8Array {
  if (chunk instanceof Uint8Array) return chunk
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk)
  return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
}

export function concatUint8Arrays(chunks: readonly Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((length, chunk) => length + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }

  return new Uint8Array(getNodeBuffer().from(base64, "base64"))
}

export function uint8ArrayToNodeBuffer(bytes: Uint8Array): Buffer {
  return getNodeBuffer().from(bytes)
}
