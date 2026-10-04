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
  private materials = new WeakMap<Material, number>()
  private nextId = 1

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
    this.ids[index] = id
    this.normals.set(n, index * 3)
    this.albedo.set(albedo, index * 3)
    this.radiance.set(radiance, index * 3)
    this.distance[index] = distance
  }

  apply(output: Uint8Array | Uint8ClampedArray, gamma: boolean) {
    const kernel = [1, 4, 6, 4, 1]
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        const index = y * this.width + x,
          id = this.ids[index]!
        if (id === 0) continue
        const k = index * 3,
          n = this.normals,
          a = this.albedo
        let r = 0,
          g = 0,
          b = 0,
          total = 0
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const px = x + dx,
              py = y + dy
            if (px < 0 || py < 0 || px >= this.width || py >= this.height)
              continue
            const neighbor = py * this.width + px,
              p = neighbor * 3
            if (this.ids[neighbor] !== id) continue
            if (
              Math.abs(this.distance[index]! - this.distance[neighbor]!) >
              this.distance[index]! * 0.02
            )
              continue
            if (
              n[k]! * n[p]! + n[k + 1]! * n[p + 1]! + n[k + 2]! * n[p + 2]! <
              0.98
            )
              continue
            if (
              Math.abs(a[k]! - a[p]!) +
                Math.abs(a[k + 1]! - a[p + 1]!) +
                Math.abs(a[k + 2]! - a[p + 2]!) >
              0.03
            )
              continue
            const weight = kernel[dy + 2]! * kernel[dx + 2]!
            total += weight
            r += this.radiance[p]! * weight
            g += this.radiance[p + 1]! * weight
            b += this.radiance[p + 2]! * weight
          }
        if (!total) continue
        const encode = (value: number) =>
          Math.floor(
            255 *
              (gamma
                ? srgbEncodeLinear01(Math.max(0, Math.min(1, value / total)))
                : Math.max(0, Math.min(1, value / total))),
          )
        output[index * 4] = encode(r)
        output[index * 4 + 1] = encode(g)
        output[index * 4 + 2] = encode(b)
      }
  }
}
