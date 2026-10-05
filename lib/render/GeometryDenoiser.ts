import type { Material } from "../gltf/types"
import { srgbEncodeLinear01 } from "../utils/srgbEncodeLinear01"

type V3 = readonly [number, number, number]

/** A small linear-radiance filter guided by geometry and albedo. Filtering
 * within a material/normal/depth surface reduces stochastic ray noise without
 * crossing silhouettes, lamination seams, or base-color texture boundaries.
 */
export class GeometryDenoiser {
  readonly ids: Int32Array
  private normals: Float32Array
  private albedo: Float32Array
  private radiance: Float32Array
  private distance: Float32Array
  private horizontal: Float32Array
  private materials = new WeakMap<Material, number>()
  private nextId = 1
  private first = Infinity
  private last = -1

  constructor(
    private width: number,
    private height: number,
  ) {
    const count = width * height
    this.ids = new Int32Array(count)
    this.normals = new Float32Array(count * 3)
    this.albedo = new Float32Array(count * 3)
    this.radiance = new Float32Array(count * 3)
    this.distance = new Float32Array(count)
    this.horizontal = new Float32Array(count * 3)
  }

  materialId(material: Material) {
    let id = this.materials.get(material)
    if (!id) {
      id = this.nextId++
      this.materials.set(material, id)
    }
    return id
  }

  record(
    index: number,
    id: number,
    n: V3,
    albedo: V3,
    radiance: V3,
    distance: number,
  ) {
    if (index < this.first) this.first = index
    if (index > this.last) this.last = index
    this.ids[index] = id
    this.normals.set(n, index * 3)
    this.albedo.set(albedo, index * 3)
    this.radiance.set(radiance, index * 3)
    this.distance[index] = distance
  }

  apply(output: Uint8Array | Uint8ClampedArray, gamma: boolean) {
    // Separable binomial filtering spends fewer guide checks than a square
    // kernel, so a wider support can reduce ray noise without a larger budget.
    const kernel = [1, 8, 28, 56, 70, 56, 28, 8, 1]
    const radius = 4
    const n = this.normals,
      a = this.albedo,
      ids = this.ids
    const firstRow = Math.floor(this.first / this.width)
    const lastRow = Math.floor(this.last / this.width)
    for (let pass = 0; pass < 2; pass++) {
      const source = pass === 0 ? this.radiance : this.horizontal
      for (let y = firstRow; y <= lastRow; y++)
        for (let x = 0; x < this.width; x++) {
          const index = y * this.width + x,
            id = ids[index]!
          if (id === 0) continue
          const k = index * 3,
            distance = this.distance[index]!
          const nx = n[k]!,
            ny = n[k + 1]!,
            nz = n[k + 2]!
          const ar = a[k]!,
            ag = a[k + 1]!,
            ab = a[k + 2]!
          let r = 0,
            g = 0,
            b = 0,
            total = 0
          for (let delta = -radius; delta <= radius; delta++) {
            const px = pass === 0 ? x + delta : x,
              py = pass === 0 ? y : y + delta
            if (px < 0 || py < 0 || px >= this.width || py >= this.height)
              continue
            const neighbor = py * this.width + px,
              p = neighbor * 3
            if (ids[neighbor] !== id) continue
            if (Math.abs(distance - this.distance[neighbor]!) > distance * 0.02)
              continue
            if (nx * n[p]! + ny * n[p + 1]! + nz * n[p + 2]! < 0.98) continue
            if (
              Math.abs(ar - a[p]!) +
                Math.abs(ag - a[p + 1]!) +
                Math.abs(ab - a[p + 2]!) >
              0.03
            )
              continue
            const weight = kernel[delta + radius]!
            total += weight
            r += source[p]! * weight
            g += source[p + 1]! * weight
            b += source[p + 2]! * weight
          }
          if (pass === 0) {
            this.horizontal[k] = r / total
            this.horizontal[k + 1] = g / total
            this.horizontal[k + 2] = b / total
          } else {
            const encode = (value: number) =>
              Math.floor(
                255 *
                  (gamma
                    ? srgbEncodeLinear01(
                        Math.max(0, Math.min(1, value / total)),
                      )
                    : Math.max(0, Math.min(1, value / total))),
              )
            output[index * 4] = encode(r)
            output[index * 4 + 1] = encode(g)
            output[index * 4 + 2] = encode(b)
          }
        }
    }
  }
}
