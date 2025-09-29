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
    this.clear([0, 0, 0, 255])
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

          if (gammaOut) {
            r = srgbEncodeLinear01(clamp(r, 0, 1))
            g = srgbEncodeLinear01(clamp(g, 0, 1))
            b = srgbEncodeLinear01(clamp(b, 0, 1))
          } else {
            r = clamp(r, 0, 1)
            g = clamp(g, 0, 1)
            b = clamp(b, 0, 1)
          }

          this.setPixel(
            x,
            y,
            (r * 255) | 0,
            (g * 255) | 0,
            (b * 255) | 0,
            (clamp(a, 0, 1) * 255) | 0,
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
