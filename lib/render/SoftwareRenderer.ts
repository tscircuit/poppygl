import { mat3, mat4, vec3, vec4 } from "gl-matrix"
import type { Camera } from "../camera/buildCamera"
import { computeSmoothNormals } from "../gltf/computeSmoothNormals"
import type { DrawCall, Material } from "../gltf/types"
import {
  type BitmapLike,
  createUint8Bitmap,
  type ImageFactory,
  type MutableRGBA,
} from "../image/createUint8Bitmap"
import { clamp } from "../utils/clamp"
import { mulColor } from "../utils/mulColor"
import { srgbDecodeToLinear01 } from "../utils/srgbDecodeToLinear01"
import { srgbEncodeLinear01 } from "../utils/srgbEncodeLinear01"
import { clipMeshToNearPlane } from "./clipMeshToNearPlane"
import { GeometryDenoiser } from "./GeometryDenoiser"
import {
  DEFAULT_LIGHT_DIR,
  DEFAULT_RENDER_OPTIONS,
} from "./getDefaultRenderOptions"
import { rasterizeWideLine } from "./rasterizeWideLine"
import type { StudioLighting } from "./StudioLighting"

export interface LightSettings {
  dir: readonly [number, number, number]
  ambient: number
}

export interface LineRenderOptions {
  /** Stroke width in this renderer's raster pixels. Defaults to one. */
  width?: number
  depthCompare?: "less" | "less-equal" | "greater"
  depthWrite?: boolean
  depthBias?: number
  dashed?: boolean
  dashLength?: number
  opacity?: number
}

export class SoftwareRenderer {
  readonly width: number
  readonly height: number
  readonly bitmap: BitmapLike
  readonly depth: Float32Array
  private readonly denoiser: GeometryDenoiser | null

  constructor(
    width: number,
    height: number,
    imageFactory: ImageFactory = createUint8Bitmap,
    denoise = false,
  ) {
    this.width = width
    this.height = height
    this.bitmap = imageFactory(width, height)
    this.depth = new Float32Array(width * height)
    this.denoiser = denoise ? new GeometryDenoiser(width, height) : null
  }

  get buffer() {
    return this.bitmap.data
  }

  clear(colorRGBA: [number, number, number, number] = [0, 0, 0, 255]) {
    this.denoiser?.ids.fill(0)
    const [r, g, b, a] = colorRGBA
    for (let i = 0; i < this.width * this.height; i++) {
      const j = i * 4
      this.buffer[j + 0] = r
      this.buffer[j + 1] = g
      this.buffer[j + 2] = b
      this.buffer[j + 3] = a
      this.depth[i] = Infinity
    }
  }

  setPixel(
    x: number,
    y: number,
    r: number,
    g: number,
    b: number,
    a: number,
    keepGuide = false,
  ) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const idx = (y * this.width + x) * 4
    if (this.denoiser && !keepGuide) this.denoiser.ids[y * this.width + x] = 0
    this.buffer[idx + 0] = r
    this.buffer[idx + 1] = g
    this.buffer[idx + 2] = b
    this.buffer[idx + 3] = a
  }

  denoise(gammaOut = true) {
    this.denoiser?.apply(this.buffer, gammaOut)
  }

  drawLines(
    mesh: DrawCall,
    camera: Camera,
    gammaOut = true,
    options: LineRenderOptions = {},
  ) {
    const { positions, indices, model, material, colors } = mesh
    if (!indices) return

    const view = camera.view
    const proj = camera.proj
    const mvp = mat4.create()
    mat4.multiply(mvp, proj, mat4.multiply(mat4.create(), view, model))

    const vertexCount = (positions.length / 3) | 0
    const vScreen = new Array<[number, number]>(vertexCount)
    const vInvW = new Float32Array(vertexCount)
    const vNDCz = new Float32Array(vertexCount)
    const clipVertices: vec4[] = []

    for (let i = 0; i < vertexCount; i++) {
      const p = vec4.fromValues(
        positions[i * 3 + 0]!,
        positions[i * 3 + 1]!,
        positions[i * 3 + 2]!,
        1,
      )
      const c = vec4.create()
      vec4.transformMat4(c, p, mvp)
      clipVertices.push(c)
      const invW = 1 / c[3]
      vInvW[i] = invW

      if (!isFinite(invW)) {
        vScreen[i] = [NaN, NaN]
        vNDCz[i] = NaN
        continue
      }

      const ndcX = c[0] * invW
      const ndcY = c[1] * invW
      const ndcZ = c[2] * invW

      const sx = (ndcX * 0.5 + 0.5) * (this.width - 1)
      const sy = (1 - (ndcY * 0.5 + 0.5)) * (this.height - 1)

      vScreen[i] = [sx, sy]
      vNDCz[i] = ndcZ
    }

    const [baseR, baseG, baseB, a] = material.baseColorFactor
    const encodeChannel = (linear: number) => {
      const clamped = clamp(linear, 0, 1)
      return ((gammaOut ? srgbEncodeLinear01(clamped) : clamped) * 255) | 0
    }
    const defaultR255 = encodeChannel(baseR)
    const defaultG255 = encodeChannel(baseG)
    const defaultB255 = encodeChannel(baseB)
    let segR255 = defaultR255
    let segG255 = defaultG255
    let segB255 = defaultB255
    const hasVertexColors = Boolean(colors && colors.length >= vertexCount * 3)
    const opacity = clamp(options.opacity ?? 1, 0, 1)
    const sourceAlpha = clamp(a, 0, 1) * opacity
    const depthCompare = options.depthCompare ?? "less"
    const depthWrite = options.depthWrite ?? true
    const depthBias = options.depthBias ?? 0
    const dashLength = Math.max(1, options.dashLength ?? 4)
    const strokeWidth =
      typeof options.width === "number" &&
      Number.isFinite(options.width) &&
      options.width > 0
        ? options.width
        : 1

    const drawFragment = (xi: number, yi: number, z: number, coverage = 1) => {
      if (z < 0 || z > 1) return
      const di = yi * this.width + xi
      const currentDepth = this.depth[di]!
      const passesDepth =
        depthCompare === "greater"
          ? z > currentDepth + depthBias
          : depthCompare === "less-equal"
            ? z <= currentDepth + depthBias
            : z < currentDepth - depthBias
      if (!passesDepth) return
      if (depthWrite) this.depth[di] = z
      const pixelIndex = di * 4
      const destinationAlpha = this.buffer[pixelIndex + 3]! / 255
      const alpha = sourceAlpha * coverage
      const oneMinusSourceAlpha = 1 - alpha
      const outAlpha = alpha + destinationAlpha * oneMinusSourceAlpha
      const blend = (channel: number, offset: number) =>
        outAlpha === 0
          ? 0
          : (channel * alpha +
              this.buffer[pixelIndex + offset]! *
                destinationAlpha *
                oneMinusSourceAlpha) /
            outAlpha
      this.setPixel(
        xi,
        yi,
        blend(segR255, 0),
        blend(segG255, 1),
        blend(segB255, 2),
        outAlpha * 255,
      )
    }

    for (let i = 0; i < indices.length; i += 2) {
      const i0 = indices[i + 0]!
      const i1 = indices[i + 1]!
      if (hasVertexColors) {
        const cr = (colors![i0 * 3 + 0]! + colors![i1 * 3 + 0]!) * 0.5
        const cg = (colors![i0 * 3 + 1]! + colors![i1 * 3 + 1]!) * 0.5
        const cb = (colors![i0 * 3 + 2]! + colors![i1 * 3 + 2]!) * 0.5
        segR255 = encodeChannel(baseR * cr)
        segG255 = encodeChannel(baseG * cg)
        segB255 = encodeChannel(baseB * cb)
      }

      if (strokeWidth !== 1) {
        // Wide edge pixels can lie inside the source face, whose depth slopes
        // away from the centerline. Compare at the same pixel-center sample as
        // drawMesh, rather than offsetting the entire stroke toward the eye.
        // Unrelated, nearer geometry continues to occlude the edge normally.
        const sourceFaces = (mesh.edgeAdjacentVertices?.[i / 2] ?? []).flatMap(
          (third) => {
            if (
              clipVertices[i0]![3] <= 0 ||
              clipVertices[i1]![3] <= 0 ||
              clipVertices[third]![3] <= 0
            )
              return []
            const a = vScreen[i0]!
            const b = vScreen[i1]!
            const c = vScreen[third]!
            const area = edge(a, b, c)
            if (!Number.isFinite(area) || area === 0) return []
            return [{ a, b, c, inverseArea: 1 / area, third }]
          },
        )
        rasterizeWideLine(
          clipVertices[i0]!,
          clipVertices[i1]!,
          this.width,
          this.height,
          strokeWidth,
          options.dashed ?? false,
          dashLength,
          sourceFaces.length === 0
            ? drawFragment
            : (x, y, z, coverage) => {
                let surfaceDepth = Infinity
                const sample: [number, number] = [x + 0.5, y + 0.5]
                for (const face of sourceFaces) {
                  const l0 = edge(face.b, face.c, sample) * face.inverseArea
                  const l1 = edge(face.c, face.a, sample) * face.inverseArea
                  const l2 = 1 - l0 - l1
                  if (l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6) continue
                  const depth =
                    (l0 * vNDCz[i0]! +
                      l1 * vNDCz[i1]! +
                      l2 * vNDCz[face.third]!) *
                      0.5 +
                    0.5
                  if (depth >= 0 && depth <= 1) {
                    surfaceDepth = Math.min(surfaceDepth, depth)
                  }
                }
                drawFragment(
                  x,
                  y,
                  surfaceDepth === Infinity ? z : surfaceDepth,
                  coverage,
                )
              },
        )
        continue
      }

      const v0s = vScreen[i0]!
      const v1s = vScreen[i1]!

      const z0_ndc = vNDCz[i0]!
      const z1_ndc = vNDCz[i1]!

      if (isNaN(v0s[0]) || isNaN(v1s[0])) continue

      const z0_01 = z0_ndc * 0.5 + 0.5
      const z1_01 = z1_ndc * 0.5 + 0.5

      // very basic clipping
      if ((z0_01 < 0 && z1_01 < 0) || (z0_01 > 1 && z1_01 > 1)) continue

      // DDA line drawing
      const x0 = Math.round(v0s[0])
      const y0 = Math.round(v0s[1])
      const x1 = Math.round(v1s[0])
      const y1 = Math.round(v1s[1])

      const dx = x1 - x0
      const dy = y1 - y0
      const steps = Math.max(Math.abs(dx), Math.abs(dy))

      if (steps === 0) continue

      const xinc = dx / steps
      const yinc = dy / steps
      const zinc = (z1_01 - z0_01) / steps

      let x = x0
      let y = y0
      let z = z0_01

      for (let k = 0; k <= steps; k++) {
        if (options.dashed && Math.floor(k / dashLength) % 2 === 1) {
          x += xinc
          y += yinc
          z += zinc
          continue
        }

        const xi = Math.round(x)
        const yi = Math.round(y)

        if (
          xi >= 0 &&
          xi < this.width &&
          yi >= 0 &&
          yi < this.height &&
          z >= 0 &&
          z <= 1
        ) {
          drawFragment(xi, yi, z)
        }
        x += xinc
        y += yinc
        z += zinc
      }
    }
  }

  drawMeshWireframe(
    mesh: DrawCall,
    camera: Camera,
    cullBackFaces = false,
    gammaOut = true,
    options: LineRenderOptions = {},
  ): number {
    if (mesh.mode != null && mesh.mode !== 4) return 0

    const alphaMode = mesh.material.alphaMode ?? "OPAQUE"
    const alphaCutoff = mesh.material.alphaCutoff ?? 0.5
    const baseAlpha = mesh.material.baseColorFactor[3]!
    if (alphaMode === "MASK" && baseAlpha < alphaCutoff) return 0

    const { positions, model, material, colors } = mesh
    const vertexCount = (positions.length / 3) | 0
    const hasVertexColors = Boolean(colors && colors.length >= vertexCount * 3)
    const sourceIndices =
      mesh.indices ??
      Uint32Array.from({ length: vertexCount }, (_, index) => index)
    if (sourceIndices.length < 3) return 0

    const mvp = mat4.create()
    mat4.multiply(
      mvp,
      camera.proj,
      mat4.multiply(mat4.create(), camera.view, model),
    )

    const distances = new Float64Array(vertexCount)
    for (let i = 0; i < vertexCount; i++) {
      distances[i] =
        (mvp[2]! + mvp[3]!) * positions[i * 3 + 0]! +
        (mvp[6]! + mvp[7]!) * positions[i * 3 + 1]! +
        (mvp[10]! + mvp[11]!) * positions[i * 3 + 2]! +
        mvp[14]! +
        mvp[15]!
    }

    const screenCache = cullBackFaces
      ? new Array<[number, number] | undefined>(vertexCount)
      : null

    const projectXYZ = (
      x: number,
      y: number,
      z: number,
    ): [number, number] | null => {
      const c = vec4.transformMat4(
        vec4.create(),
        vec4.fromValues(x, y, z, 1),
        mvp,
      )
      const invW = 1 / c[3]
      if (!Number.isFinite(invW)) return null
      const sx = (c[0] * invW * 0.5 + 0.5) * (this.width - 1)
      const sy = (1 - (c[1] * invW * 0.5 + 0.5)) * (this.height - 1)
      return [sx, sy]
    }

    const projectVertex = (index: number): [number, number] | null => {
      const cached = screenCache![index]
      if (cached !== undefined) return cached
      const projected = projectXYZ(
        positions[index * 3 + 0]!,
        positions[index * 3 + 1]!,
        positions[index * 3 + 2]!,
      )
      if (projected) screenCache![index] = projected
      return projected
    }

    const isFrontFacing = (i0: number, i1: number, i2: number): boolean => {
      const d0 = distances[i0]!
      const d1 = distances[i1]!
      const d2 = distances[i2]!
      if (d0 >= 0 && d1 >= 0 && d2 >= 0) {
        const s0 = projectVertex(i0)
        const s1 = projectVertex(i1)
        const s2 = projectVertex(i2)
        if (!s0 || !s1 || !s2) return false
        return edge(s0, s1, s2) > 0
      }

      const tri = [i0, i1, i2]
      const poly: [number, number][] = []
      for (let j = 0; j < 3; j++) {
        const a = tri[j]!
        const b = tri[(j + 1) % 3]!
        const da = distances[a]!
        const db = distances[b]!
        const aIn = da >= 0
        const bIn = db >= 0
        if (aIn) {
          const sa = projectVertex(a)
          if (!sa) return false
          poly.push(sa)
        }
        if (aIn !== bIn) {
          const rawT = da / (da - db)
          const t = aIn ? Math.max(0, rawT - 1e-6) : Math.min(1, rawT + 1e-6)
          const sb = projectXYZ(
            positions[a * 3 + 0]! +
              t * (positions[b * 3 + 0]! - positions[a * 3 + 0]!),
            positions[a * 3 + 1]! +
              t * (positions[b * 3 + 1]! - positions[a * 3 + 1]!),
            positions[a * 3 + 2]! +
              t * (positions[b * 3 + 2]! - positions[a * 3 + 2]!),
          )
          if (!sb) return false
          poly.push(sb)
        }
      }
      if (poly.length < 3) return false
      return edge(poly[0]!, poly[1]!, poly[2]!) > 0
    }

    const extraPositions: number[] = []
    const extraColors: number[] = []
    const clippedIntersections = new Map<string, number>()
    const clipVertex = (a: number, b: number): number => {
      const lo = a < b ? a : b
      const hi = a < b ? b : a
      const key = `${lo}:${hi}`
      const existing = clippedIntersections.get(key)
      if (existing !== undefined) return existing

      const dLo = distances[lo]!
      const dHi = distances[hi]!
      const rawT = dLo / (dLo - dHi)
      const t = dLo >= 0 ? Math.max(0, rawT - 1e-6) : Math.min(1, rawT + 1e-6)
      const newIndex = vertexCount + extraPositions.length / 3
      extraPositions.push(
        positions[lo * 3 + 0]! +
          t * (positions[hi * 3 + 0]! - positions[lo * 3 + 0]!),
        positions[lo * 3 + 1]! +
          t * (positions[hi * 3 + 1]! - positions[lo * 3 + 1]!),
        positions[lo * 3 + 2]! +
          t * (positions[hi * 3 + 2]! - positions[lo * 3 + 2]!),
      )
      if (hasVertexColors) {
        extraColors.push(
          colors![lo * 3 + 0]! +
            t * (colors![hi * 3 + 0]! - colors![lo * 3 + 0]!),
          colors![lo * 3 + 1]! +
            t * (colors![hi * 3 + 1]! - colors![lo * 3 + 1]!),
          colors![lo * 3 + 2]! +
            t * (colors![hi * 3 + 2]! - colors![lo * 3 + 2]!),
        )
      }
      clippedIntersections.set(key, newIndex)
      return newIndex
    }

    const seenEdges = new Set<string>()
    const lineIndices: number[] = []

    const addWireEdge = (a: number, b: number) => {
      const da = distances[a]!
      const db = distances[b]!
      if (!Number.isFinite(da) || !Number.isFinite(db)) return
      if (da < 0 && db < 0) return

      const keyA = `${positions[a * 3 + 0]},${positions[a * 3 + 1]},${positions[a * 3 + 2]}`
      const keyB = `${positions[b * 3 + 0]},${positions[b * 3 + 1]},${positions[b * 3 + 2]}`
      if (keyA === keyB) return
      const edgeKey = keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`
      if (seenEdges.has(edgeKey)) return
      seenEdges.add(edgeKey)

      const start = da >= 0 ? a : clipVertex(a, b)
      const end = db >= 0 ? b : clipVertex(a, b)
      lineIndices.push(start, end)
    }

    for (let i = 0; i + 2 < sourceIndices.length; i += 3) {
      const i0 = sourceIndices[i + 0]!
      const i1 = sourceIndices[i + 1]!
      const i2 = sourceIndices[i + 2]!

      const d0 = distances[i0]!
      const d1 = distances[i1]!
      const d2 = distances[i2]!
      if (!Number.isFinite(d0) || !Number.isFinite(d1) || !Number.isFinite(d2))
        continue
      if (d0 < 0 && d1 < 0 && d2 < 0) continue
      if (cullBackFaces && !isFrontFacing(i0, i1, i2)) continue

      addWireEdge(i0, i1)
      addWireEdge(i1, i2)
      addWireEdge(i2, i0)
    }

    if (lineIndices.length === 0) return 0

    let linePositions = positions
    if (extraPositions.length > 0) {
      linePositions = new Float32Array(positions.length + extraPositions.length)
      linePositions.set(positions, 0)
      linePositions.set(extraPositions, positions.length)
    }

    let lineColors = hasVertexColors ? colors! : null
    if (hasVertexColors && extraColors.length > 0) {
      lineColors = new Float32Array(colors!.length + extraColors.length)
      lineColors.set(colors!, 0)
      lineColors.set(extraColors, colors!.length)
    }

    const emission = material.emissiveFactor ?? [0, 0, 0]
    const strength = material.emissiveStrength ?? 1
    const wireColor: [number, number, number, number] = [
      clamp(material.baseColorFactor[0]! + emission[0] * strength, 0, 1),
      clamp(material.baseColorFactor[1]! + emission[1] * strength, 0, 1),
      clamp(material.baseColorFactor[2]! + emission[2] * strength, 0, 1),
      alphaMode === "BLEND" ? baseAlpha : 1,
    ]

    this.drawLines(
      {
        positions: linePositions,
        normals: null,
        uvs: null,
        colors: lineColors,
        indices: new Uint32Array(lineIndices),
        model,
        material: {
          ...material,
          baseColorFactor: wireColor,
        },
        mode: 1,
      },
      camera,
      gammaOut,
      {
        ...options,
        depthWrite: options.depthWrite ?? alphaMode !== "BLEND",
      },
    )

    return lineIndices.length / 2
  }

  sampleTextureNearest(
    img: BitmapLike | null,
    u: number,
    v: number,
  ): MutableRGBA {
    if (!img) return [1, 1, 1, 1]
    const x = clamp(Math.floor(u * (img.width - 1)), 0, img.width - 1)
    const y = clamp(Math.floor(v * (img.height - 1)), 0, img.height - 1)
    const idx = (y * img.width + x) * 4
    const d = img.data
    return [
      d[idx + 0]! / 255,
      d[idx + 1]! / 255,
      d[idx + 2]! / 255,
      d[idx + 3]! / 255,
    ]
  }

  perspInterp(attrs: number[][], invWs: number[], lambdas: number[]) {
    const [lambda0, lambda1, lambda2] = lambdas as [number, number, number]
    const [invW0, invW1, invW2] = invWs as [number, number, number]
    const [attr0, attr1, attr2] = attrs as [number[], number[], number[]]
    const denom = lambda0 * invW0 + lambda1 * invW1 + lambda2 * invW2
    const n = attr0.length
    const out = new Array<number>(n).fill(0)
    for (let j = 0; j < n; j++) {
      out[j] =
        (lambda0 * attr0[j]! * invW0 +
          lambda1 * attr1[j]! * invW1 +
          lambda2 * attr2[j]! * invW2) /
        denom
    }
    return out
  }

  drawMesh(
    mesh: DrawCall,
    camera: Camera,
    light: LightSettings,
    material: Material,
    cullBackFaces = true,
    gammaOut = true,
    studio?: StudioLighting,
    visibility?: {
      winners: Int32Array
      triangleOffset: number
      depthOnly: boolean
    },
  ) {
    let { positions, normals, uvs, indices, model, colors } = mesh
    const materialId = this.denoiser?.materialId(material) ?? 0
    const lightDir = light.dir ?? DEFAULT_LIGHT_DIR
    const ambient = clamp(light.ambient ?? DEFAULT_RENDER_OPTIONS.ambient, 0, 1)
    const L = studio
      ? null
      : vec3.normalize(
          vec3.create(),
          vec3.fromValues(lightDir[0], lightDir[1], lightDir[2]),
        )

    const view = camera.view
    const proj = camera.proj
    const mvp = mat4.create()
    mat4.multiply(mvp, proj, mat4.multiply(mat4.create(), view, model))

    const normalMat = mat3.create()
    mat3.normalFromMat4(normalMat, model)

    let vertexCount = (positions.length / 3) | 0
    let idx =
      indices ??
      (() => {
        const a = new Uint32Array(vertexCount)
        for (let i = 0; i < vertexCount; i++) a[i] = i
        return a
      })()

    let useNormals = normals
    if (!useNormals) {
      useNormals = computeSmoothNormals(positions, idx)
    }

    const clipped = clipMeshToNearPlane(
      { ...mesh, normals: useNormals, indices: idx },
      mvp,
    )
    positions = clipped.positions
    useNormals = clipped.normals!
    uvs = clipped.uvs
    colors = clipped.colors
    idx = clipped.indices!
    vertexCount = positions.length / 3
    const depthOnly = visibility?.depthOnly ?? false

    const vScreen = new Array<[number, number]>(vertexCount)
    const vInvW = new Float32Array(vertexCount)
    const vNDCz = new Float32Array(vertexCount)
    const vWorldN = new Array<[number, number, number]>(
      depthOnly ? 0 : vertexCount,
    )
    const vWorldP =
      studio && !depthOnly
        ? new Array<[number, number, number]>(vertexCount)
        : null
    const vColor = new Array<[number, number, number]>(
      depthOnly ? 0 : vertexCount,
    )

    for (let i = 0; i < vertexCount; i++) {
      const p = vec4.fromValues(
        positions[i * 3 + 0]!,
        positions[i * 3 + 1]!,
        positions[i * 3 + 2]!,
        1,
      )
      const c = vec4.create()
      vec4.transformMat4(c, p, mvp)
      if (vWorldP) {
        const world = vec4.transformMat4(vec4.create(), p, model)
        vWorldP[i] = [world[0], world[1], world[2]]
      }
      const invW = 1 / c[3]
      const ndcX = c[0] * invW
      const ndcY = c[1] * invW
      const ndcZ = c[2] * invW

      const sx = (ndcX * 0.5 + 0.5) * (this.width - 1)
      const sy = (1 - (ndcY * 0.5 + 0.5)) * (this.height - 1)

      vScreen[i] = [sx, sy]
      vInvW[i] = invW
      vNDCz[i] = ndcZ

      if (depthOnly) continue

      const n = vec3.fromValues(
        useNormals[i * 3 + 0]!,
        useNormals[i * 3 + 1]!,
        useNormals[i * 3 + 2]!,
      )
      const nw = vec3.create()
      vec3.transformMat3(nw, n, normalMat)
      vWorldN[i] = [nw[0]!, nw[1]!, nw[2]!]

      if (colors && colors.length >= (i + 1) * 3) {
        vColor[i] = [colors[i * 3 + 0]!, colors[i * 3 + 1]!, colors[i * 3 + 2]!]
      } else {
        vColor[i] = [1, 1, 1]
      }
    }

    for (let i = 0; i < idx.length; i += 3) {
      const i0 = idx[i + 0]!
      const i1 = idx[i + 1]!
      const i2 = idx[i + 2]!

      if (
        !(isFinite(vInvW[i0]!) && isFinite(vInvW[i1]!) && isFinite(vInvW[i2]!))
      )
        continue

      const v0 = vScreen[i0]!
      const v1 = vScreen[i1]!
      const v2 = vScreen[i2]!

      const area = edge(v0, v1, v2)
      if (area === 0) continue
      if (cullBackFaces && area < 0) continue

      const minX = Math.max(0, Math.floor(Math.min(v0[0], v1[0], v2[0])))
      const maxX = Math.min(
        this.width - 1,
        Math.ceil(Math.max(v0[0], v1[0], v2[0])),
      )
      const minY = Math.max(0, Math.floor(Math.min(v0[1], v1[1], v2[1])))
      const maxY = Math.min(
        this.height - 1,
        Math.ceil(Math.max(v0[1], v1[1], v2[1])),
      )

      const invW: [number, number, number] = [
        vInvW[i0]!,
        vInvW[i1]!,
        vInvW[i2]!,
      ]
      const ndcZ: [number, number, number] = [
        vNDCz[i0]!,
        vNDCz[i1]!,
        vNDCz[i2]!,
      ]
      const nws: [number, number, number][] = [
        vWorldN[i0]!,
        vWorldN[i1]!,
        vWorldN[i2]!,
      ]
      const worldPositions = vWorldP
        ? [vWorldP[i0]!, vWorldP[i1]!, vWorldP[i2]!]
        : null
      const uv: [number, number][] | null = uvs
        ? [
            [uvs[i0 * 2 + 0]!, uvs[i0 * 2 + 1]!],
            [uvs[i1 * 2 + 0]!, uvs[i1 * 2 + 1]!],
            [uvs[i2 * 2 + 0]!, uvs[i2 * 2 + 1]!],
          ]
        : null

      const cs: [number, number, number][] = [
        vColor[i0]!,
        vColor[i1]!,
        vColor[i2]!,
      ]

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const p: [number, number] = [x + 0.5, y + 0.5]
          const w0 = edge(v1, v2, p)
          const w1 = edge(v2, v0, p)
          const w2 = edge(v0, v1, p)
          if (w0 < 0 || w1 < 0 || w2 < 0) continue

          const invArea = 1 / area
          const l0 = w0 * invArea
          const l1 = w1 * invArea
          const l2 = w2 * invArea

          const zndc = l0 * ndcZ[0] + l1 * ndcZ[1] + l2 * ndcZ[2]
          const z01 = zndc * 0.5 + 0.5
          if (z01 < 0 || z01 > 1) continue
          const di = y * this.width + x
          if (
            visibility &&
            !visibility.depthOnly &&
            visibility.winners[di] !== visibility.triangleOffset + i / 3
          )
            continue
          const depth = this.depth
          if (z01 >= depth[di]!) continue
          depth[di] = z01

          if (visibility?.depthOnly) {
            visibility.winners[di] = visibility.triangleOffset + i / 3
            continue
          }

          let baseColor: MutableRGBA = [
            material.baseColorFactor[0]!,
            material.baseColorFactor[1]!,
            material.baseColorFactor[2]!,
            material.baseColorFactor[3]!,
          ]
          if (uv && material.baseColorTexture) {
            const uvp = this.perspInterp(uv, invW, [l0, l1, l2])
            const texel = this.sampleTextureNearest(
              material.baseColorTexture,
              material.baseColorTextureWrap === "repeat"
                ? uvp[0]! - Math.floor(uvp[0]!)
                : uvp[0]!,
              material.baseColorTextureWrap === "repeat"
                ? uvp[1]! - Math.floor(uvp[1]!)
                : uvp[1]!,
            )
            // glTF base-color textures store sRGB RGB and linear alpha.
            // Decode before multiplying by the linear material factor and lighting.
            baseColor = mulColor(baseColor, [
              srgbDecodeToLinear01(texel[0]),
              srgbDecodeToLinear01(texel[1]),
              srgbDecodeToLinear01(texel[2]),
              texel[3],
            ])
          }

          const [cr, cg, cb] = this.perspInterp(cs, invW, [l0, l1, l2]) as [
            number,
            number,
            number,
          ]
          baseColor = [
            baseColor[0] * cr,
            baseColor[1] * cg,
            baseColor[2] * cb,
            baseColor[3],
          ]

          const [np0, np1, np2] = this.perspInterp(nws, invW, [l0, l1, l2]) as [
            number,
            number,
            number,
          ]
          const nlen = Math.hypot(np0, np1, np2) || 1
          const nrm: [number, number, number] = [
            np0 / nlen,
            np1 / nlen,
            np2 / nlen,
          ]

          let r = 0,
            g = 0,
            b = 0
          if (studio && worldPositions) {
            const position = this.perspInterp(worldPositions, invW, [
              l0,
              l1,
              l2,
            ]) as [number, number, number]
            ;[r, g, b] = studio.shade(
              position,
              nrm,
              [baseColor[0], baseColor[1], baseColor[2]],
              material,
              x,
              y,
            )
          } else {
            const ndotl = Math.max(
              0,
              nrm[0] * -L![0]! + nrm[1] * -L![1]! + nrm[2] * -L![2]!,
            )
            const lit = ambient + (1 - ambient) * ndotl
            r = baseColor[0] * lit
            g = baseColor[1] * lit
            b = baseColor[2] * lit
          }
          // Emission is linear radiance, independent of lights and shadows.
          const emission = material.emissiveFactor ?? [0, 0, 0]
          const strength = material.emissiveStrength ?? 1
          let er = emission[0],
            eg = emission[1],
            eb = emission[2]
          if (uv && material.emissiveTexture) {
            const uvp = this.perspInterp(uv, invW, [l0, l1, l2])
            const texel = this.sampleTextureNearest(
              material.emissiveTexture,
              uvp[0]!,
              uvp[1]!,
            )
            er *= srgbDecodeToLinear01(texel[0])
            eg *= srgbDecodeToLinear01(texel[1])
            eb *= srgbDecodeToLinear01(texel[2])
          }
          r += er * strength
          g += eg * strength
          b += eb * strength
          let a = baseColor[3]
          // Keep scalar guides until the realistic-only denoising path needs
          // them, so regular rendering does not allocate a tuple per pixel.
          const linearR = r,
            linearG = g,
            linearB = b

          // Handle material transparency
          const alphaMode = material.alphaMode ?? "OPAQUE"
          const alphaCutoff = material.alphaCutoff ?? 0.5

          // Skip masked fragments below cutoff
          if (alphaMode === "MASK" && a < alphaCutoff) continue

          // glTF OPAQUE materials ignore alpha. MASK materials are also fully
          // opaque after passing the cutoff.
          if (alphaMode !== "BLEND") {
            a = 1
          }

          // For BLEND, do not write to depth yet — blend with existing pixel
          const shouldWriteDepth = alphaMode !== "BLEND"
          if (shouldWriteDepth) {
            depth[di] = z01
          }

          // Convert to sRGB if needed
          if (gammaOut) {
            r = srgbEncodeLinear01(clamp(r, 0, 1))
            g = srgbEncodeLinear01(clamp(g, 0, 1))
            b = srgbEncodeLinear01(clamp(b, 0, 1))
          } else {
            r = clamp(r, 0, 1)
            g = clamp(g, 0, 1)
            b = clamp(b, 0, 1)
          }
          const dstIdx = (y * this.width + x) * 4
          const dstR = (this.buffer[dstIdx + 0] ?? 0) / 255
          const dstG = (this.buffer[dstIdx + 1] ?? 0) / 255
          const dstB = (this.buffer[dstIdx + 2] ?? 0) / 255
          const dstA = (this.buffer[dstIdx + 3] ?? 0) / 255

          let outR = r
          let outG = g
          let outB = b
          let outA = a

          if (alphaMode === "BLEND" && a < 1.0) {
            // Simple "over" alpha blending
            const oneMinusA = 1 - a
            outR = r * a + dstR * oneMinusA
            outG = g * a + dstG * oneMinusA
            outB = b * a + dstB * oneMinusA
            outA = a + dstA * oneMinusA
          }

          this.setPixel(
            x,
            y,
            (clamp(outR, 0, 1) * 255) | 0,
            (clamp(outG, 0, 1) * 255) | 0,
            (clamp(outB, 0, 1) * 255) | 0,
            (clamp(outA, 0, 1) * 255) | 0,
            true,
          )
          if (this.denoiser) {
            if (alphaMode !== "BLEND") {
              const distance = 1 / (l0 * invW[0] + l1 * invW[1] + l2 * invW[2])
              this.denoiser.record(
                di,
                materialId,
                nrm,
                [baseColor[0], baseColor[1], baseColor[2]],
                [linearR, linearG, linearB],
                distance,
              )
            } else this.denoiser.ids[di] = 0
          }
        }
      }
    }
    return idx.length / 3
  }
}

function edge(
  a: readonly [number, number],
  b: readonly [number, number],
  p: readonly [number, number],
) {
  return (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])
}
