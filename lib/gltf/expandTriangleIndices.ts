export const GLTF_TRIANGLES = 4
export const GLTF_TRIANGLE_STRIP = 5
export const GLTF_TRIANGLE_FAN = 6

/**
 * Convert triangle-family glTF primitives to a TRIANGLES index list.
 *
 * `undefined` means the primitive is points/lines and should be skipped.
 * `null` means non-indexed TRIANGLES (draw vertices in order).
 * Odd TRIANGLE_STRIP triangles reverse winding per the glTF spec.
 */
export function triangleListIndices(
  mode: number | null | undefined,
  indices: Uint32Array | null,
  vertexCount: number,
): Uint32Array | null | undefined {
  const resolvedMode = mode ?? GLTF_TRIANGLES

  if (resolvedMode === GLTF_TRIANGLES) {
    return indices
  }

  if (
    resolvedMode !== GLTF_TRIANGLE_STRIP &&
    resolvedMode !== GLTF_TRIANGLE_FAN
  ) {
    return undefined
  }

  const source =
    indices ?? Uint32Array.from({ length: vertexCount }, (_, index) => index)
  if (source.length < 3) {
    return new Uint32Array(0)
  }

  const corners: number[] = []
  if (resolvedMode === GLTF_TRIANGLE_STRIP) {
    for (let index = 0; index < source.length - 2; index++) {
      const a = source[index]!
      const b = source[index + 1]!
      const c = source[index + 2]!
      if (index % 2 === 0) {
        corners.push(a, b, c)
      } else {
        corners.push(b, a, c)
      }
    }
  } else {
    const first = source[0]!
    for (let index = 1; index < source.length - 1; index++) {
      corners.push(first, source[index]!, source[index + 1]!)
    }
  }

  return new Uint32Array(corners)
}
