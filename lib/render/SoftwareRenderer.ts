import { mat3, mat4, vec3, vec4 } from "gl-matrix"
import type { Camera } from "../camera/buildCamera"
import { computeSmoothNormals } from "../gltf/computeSmoothNormals"
import type { DrawCall, Material } from "../gltf/types"
import {
  type BitmapLike,
  type ImageFactory,
  type MutableRGBA,
  createUint8Bitmap,
} from "../image/createUint8Bitmap"
import {
  DEFAULT_LIGHT_DIR,
  DEFAULT_RENDER_OPTIONS,
} from "./getDefaultRenderOptions"
import { mulColor } from "../utils/mulColor"
import { srgbEncodeLinear01 } from "../utils/srgbEncodeLinear01"
import { clamp } from "../utils/clamp"

export interface LightSettings {
  dir: readonly [number, number, number]
  ambient: number
}

export class SoftwareRenderer {
  readonly width: number
  readonly height: number
  readonly bitmap: BitmapLike
  readonly depth: Float32Array

  constructor(
    width: number,
    height: number,
    imageFactory: ImageFactory = createUint8Bitmap,
  ) {
    this.width = width
    this.height = height
    this.bitmap = imageFactory(width, height)
    this.depth = new Float32Array(width * height)
  }

  get buffer() {
    return this.bitmap.data
  }

  clear(colorRGBA: [number, number, number, number] = [0, 0, 0, 255]) {
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

  setPixel(x: number, y: number, r: number, g: number, b: number, a: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const idx = (y * this.width + x) * 4
    this.buffer[idx + 0] = r
    this.buffer[idx + 1] = g
    this.buffer[idx + 2] = b
    this.buffer[idx + 3] = a
  }

  drawLines(mesh: DrawCall, camera: Camera, gammaOut = true) {
    const { positions, indices, model, material } = mesh
    if (!indices) return

    const view = camera.view
    const proj = camera.proj
    const mvp = mat4.create()
    mat4.multiply(mvp, proj, mat4.multiply(mat4.create(), view, model))

    const vertexCount = (positions.length / 3) | 0
    const vScreen = new Array<[number, number]>(vertexCount)
    const vInvW = new Float32Array(vertexCount)
    const vNDCz = new Float32Array(vertexCount)

    for (let i = 0; i < vertexCount; i++) {
      const p = vec4.fromValues(
        positions[i * 3 + 0]!,
        positions[i * 3 + 1]!,
        positions[i * 3 + 2]!,
        1,
      )
      const c = vec4.create()
      vec4.transformMat4(c, p, mvp)
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

    let [r, g, b, a] = material.baseColorFactor
    if (gammaOut) {
      r = srgbEncodeLinear01(clamp(r, 0, 1))
      g = srgbEncodeLinear01(clamp(g, 0, 1))
      b = srgbEncodeLinear01(clamp(b, 0, 1))
    } else {
      r = clamp(r, 0, 1)
      g = clamp(g, 0, 1)
      b = clamp(b, 0, 1)
    }

    const r255 = (r * 255) | 0
    const g255 = (g * 255) | 0
    const b255 = (b * 255) | 0
    const a255 = (clamp(a, 0, 1) * 255) | 0

    for (let i = 0; i < indices.length; i += 2) {
      const i0 = indices[i + 0]!
      const i1 = indices[i + 1]!

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
          const di = yi * this.width + xi
          if (z < this.depth[di]!) {
            this.depth[di] = z
            this.setPixel(xi, yi, r255, g255, b255, a255)
          }
        }
        x += xinc
        y += yinc
        z += zinc
      }
    }
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

  /**
   * Draws an infinite grid with fade-out effect matching 3d-viewer appearance
   */
  drawInfiniteGrid(params: {
    camera: Camera
    cell_size?: number
    section_size?: number
    fade_distance?: number
    fade_strength?: number
    grid_color?: readonly [number, number, number]
    section_color?: readonly [number, number, number]
    gamma_out?: boolean
  }) {
    const cellSize = params.cell_size ?? 1
    const sectionSize = params.section_size ?? 10
    const fadeDistance = params.fade_distance ?? 100
    const fadeStrength = params.fade_strength ?? 1.5
    const gridColor = params.grid_color ?? [0.93, 0.93, 0.93]
    const sectionColor = params.section_color ?? [0.8, 0.8, 1.0]
    const gammaOut = params.gamma_out ?? true
    const camera = params.camera
    const view = camera.view
    const proj = camera.proj

    // Get camera position from inverse view matrix
    const invView = mat4.create()
    mat4.invert(invView, view)
    const camPosX = invView[12]
    const camPosY = invView[13]
    const camPosZ = invView[14]

    // Combined view-projection matrix
    const vp = mat4.create()
    mat4.multiply(vp, proj, view)
    const invVP = mat4.create()
    mat4.invert(invVP, vp)

    // For each pixel, ray-cast to find grid intersection
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        // NDC coordinates
        const ndcX = (x / (this.width - 1)) * 2 - 1
        const ndcY = 1 - (y / (this.height - 1)) * 2

        // Ray direction in world space
        const nearPoint = vec4.fromValues(ndcX, ndcY, -1, 1)
        const farPoint = vec4.fromValues(ndcX, ndcY, 1, 1)

        vec4.transformMat4(nearPoint, nearPoint, invVP)
        vec4.transformMat4(farPoint, farPoint, invVP)

        // Perspective division
        nearPoint[0] /= nearPoint[3]
        nearPoint[1] /= nearPoint[3]
        nearPoint[2] /= nearPoint[3]
        farPoint[0] /= farPoint[3]
        farPoint[1] /= farPoint[3]
        farPoint[2] /= farPoint[3]

        // Ray from near to far
        const rayDirX = farPoint[0] - nearPoint[0]
        const rayDirY = farPoint[1] - nearPoint[1]
        const rayDirZ = farPoint[2] - nearPoint[2]

        // Intersect ray with y=0 plane
        // rayOrigin + t * rayDir = (x, 0, z)
        // nearPoint[1] + t * rayDirY = 0
        if (Math.abs(rayDirY) < 1e-6) continue // Ray parallel to plane

        const t = -nearPoint[1] / rayDirY
        if (t < 0 || t > 1) continue // Intersection behind camera or too far

        const worldX = nearPoint[0] + t * rayDirX
        const worldZ = nearPoint[2] + t * rayDirZ

        // Distance from camera to intersection point (in XZ plane)
        const dx = worldX - camPosX
        const dz = worldZ - camPosZ
        const dist = Math.sqrt(dx * dx + dz * dz)

        // Fade calculation
        const alpha = computeGridFadeAlpha({
          dist,
          fade_distance: fadeDistance,
          fade_strength: fadeStrength,
        })

        if (alpha <= 0.0) continue

        // Calculate grid line intensities
        // Cell grid uses thinner lines (higher multiplier = thinner)
        const g1 = computeGridLineIntensity({
          world_x: worldX,
          world_z: worldZ,
          cell_size: cellSize,
          dist,
          screen_width: this.width,
          screen_height: this.height,
          line_thickness_multiplier: 0.8,
        })

        // Section grid uses thicker lines (lower multiplier = thicker)
        const g2 = computeGridLineIntensity({
          world_x: worldX,
          world_z: worldZ,
          cell_size: sectionSize,
          dist,
          screen_width: this.width,
          screen_height: this.height,
          line_thickness_multiplier: 0.5, // Thicker section lines
        })

        const gridStrength = Math.max(g1, g2)
        if (gridStrength <= 0.0) continue

        // Mix colors exactly like shader: mix(gridColor, sectionColor, g2)
        const finalR = gridColor[0] * (1.0 - g2) + sectionColor[0] * g2
        const finalG = gridColor[1] * (1.0 - g2) + sectionColor[1] * g2
        const finalB = gridColor[2] * (1.0 - g2) + sectionColor[2] * g2

        const finalAlpha = gridStrength * alpha

        if (finalAlpha <= 0.01) continue

        // Apply gamma correction
        let outR = finalR
        let outG = finalG
        let outB = finalB

        if (gammaOut) {
          outR = srgbEncodeLinear01(clamp(outR, 0, 1))
          outG = srgbEncodeLinear01(clamp(outG, 0, 1))
          outB = srgbEncodeLinear01(clamp(outB, 0, 1))
        } else {
          outR = clamp(outR, 0, 1)
          outG = clamp(outG, 0, 1)
          outB = clamp(outB, 0, 1)
        }

        // Alpha blend with existing pixel
        const dstIdx = (y * this.width + x) * 4
        const dstR = (this.buffer[dstIdx + 0] ?? 0) / 255
        const dstG = (this.buffer[dstIdx + 1] ?? 0) / 255
        const dstB = (this.buffer[dstIdx + 2] ?? 0) / 255
        const dstA = (this.buffer[dstIdx + 3] ?? 0) / 255

        const oneMinusA = 1 - finalAlpha
        const blendR = outR * finalAlpha + dstR * oneMinusA
        const blendG = outG * finalAlpha + dstG * oneMinusA
        const blendB = outB * finalAlpha + dstB * oneMinusA
        const blendA = finalAlpha + dstA * oneMinusA

        this.setPixel(
          x,
          y,
          (clamp(blendR, 0, 1) * 255) | 0,
          (clamp(blendG, 0, 1) * 255) | 0,
          (clamp(blendB, 0, 1) * 255) | 0,
          (clamp(blendA, 0, 1) * 255) | 0,
        )
      }
    }
  }

  drawMesh(
    mesh: DrawCall,
    camera: Camera,
    light: LightSettings,
    material: Material,
    cullBackFaces = true,
    gammaOut = true,
  ) {
    const { positions, normals, uvs, indices, model, colors } = mesh

    const view = camera.view
    const proj = camera.proj
    const mvp = mat4.create()
    mat4.multiply(mvp, proj, mat4.multiply(mat4.create(), view, model))

    const normalMat = mat3.create()
    mat3.normalFromMat4(normalMat, model)

    const vertexCount = (positions.length / 3) | 0
    const idx =
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

    const vScreen = new Array<[number, number]>(vertexCount)
    const vInvW = new Float32Array(vertexCount)
    const vNDCz = new Float32Array(vertexCount)
    const vWorldN = new Array<[number, number, number]>(vertexCount)
    const vColor = new Array<[number, number, number]>(vertexCount)

    for (let i = 0; i < vertexCount; i++) {
      const p = vec4.fromValues(
        positions[i * 3 + 0]!,
        positions[i * 3 + 1]!,
        positions[i * 3 + 2]!,
        1,
      )
      const c = vec4.create()
      vec4.transformMat4(c, p, mvp)
      const invW = 1 / c[3]
      const ndcX = c[0] * invW
      const ndcY = c[1] * invW
      const ndcZ = c[2] * invW

      const sx = Math.round((ndcX * 0.5 + 0.5) * (this.width - 1))
      const sy = Math.round((1 - (ndcY * 0.5 + 0.5)) * (this.height - 1))

      vScreen[i] = [sx, sy]
      vInvW[i] = invW
      vNDCz[i] = ndcZ

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

      let minX = Math.max(0, Math.min(v0[0], v1[0], v2[0]) | 0)
      let maxX = Math.min(this.width - 1, Math.max(v0[0], v1[0], v2[0]) | 0)
      let minY = Math.max(0, Math.min(v0[1], v1[1], v2[1]) | 0)
      let maxY = Math.min(this.height - 1, Math.max(v0[1], v1[1], v2[1]) | 0)

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
          const di = y * this.width + x
          const depth = this.depth
          if (z01 >= depth[di]!) continue
          depth[di] = z01

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
              uvp[0]!,
              uvp[1]!,
            )
            baseColor = mulColor(baseColor, texel)
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

          const lightDir = light.dir ?? DEFAULT_LIGHT_DIR
          const ambient = clamp(
            light.ambient ?? DEFAULT_RENDER_OPTIONS.ambient,
            0,
            1,
          )
          const L = vec3.normalize(
            vec3.create(),
            vec3.fromValues(lightDir[0], lightDir[1], lightDir[2]),
          )
          const ndotl = Math.max(
            0,
            nrm[0] * -L[0] + nrm[1] * -L[1] + nrm[2] * -L[2],
          )
          const lit = ambient + (1 - ambient) * ndotl

          let r = baseColor[0] * lit
          let g = baseColor[1] * lit
          let b = baseColor[2] * lit
          let a = baseColor[3]

          // Handle material transparency
          const alphaMode = material.alphaMode ?? "OPAQUE"
          const alphaCutoff = material.alphaCutoff ?? 0.5

          // Skip masked fragments below cutoff
          if (alphaMode === "MASK" && a < alphaCutoff) continue

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
          )
        }
      }
    }
  }
}

function edge(
  a: readonly [number, number],
  b: readonly [number, number],
  p: readonly [number, number],
) {
  return (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])
}

/**
 * Calculate grid line intensity at world position.
 * Returns value from 0 (no line) to 1 (on line).
 */
function computeGridLineIntensity(params: {
  world_x: number
  world_z: number
  cell_size: number
  dist: number
  screen_width: number
  screen_height: number
  line_thickness_multiplier: number
}): number {
  const rx = params.world_x / params.cell_size
  const rz = params.world_z / params.cell_size

  // fract(r - 0.5) - 0.5 gives us distance from grid line
  const fract_x = rx - Math.floor(rx + 0.5)
  const fract_z = rz - Math.floor(rz + 0.5)
  const grid_x = Math.abs(fract_x)
  const grid_z = Math.abs(fract_z)

  // Approximate fwidth as derivative - scale based on distance and screen resolution
  // This makes lines thinner when far away, thicker when close
  const pixel_size_in_world =
    params.dist / Math.min(params.screen_width, params.screen_height)
  const fwidth_x = pixel_size_in_world / params.cell_size
  const fwidth_z = pixel_size_in_world / params.cell_size

  const line_x = grid_x / (fwidth_x + 0.0001)
  const line_z = grid_z / (fwidth_z + 0.0001)
  const line = Math.min(line_x, line_z)

  // Adjust line thickness - lower multiplier = thicker lines
  return 1.0 - Math.min(line * params.line_thickness_multiplier, 1.0)
}

/**
 * Calculate fade alpha based on distance from camera
 */
function computeGridFadeAlpha(params: {
  dist: number
  fade_distance: number
  fade_strength: number
}): number {
  const fade_start = params.fade_distance
  const fade_end = params.fade_distance * params.fade_strength
  return (
    1.0 -
    Math.min(
      1.0,
      Math.max(0.0, (params.dist - fade_start) / (fade_end - fade_start)),
    )
  )
}
