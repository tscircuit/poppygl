import { mat4 } from "gl-matrix"
import type { Camera } from "../camera/buildCamera"
import type { DrawCall, Material } from "../gltf/types"
import environment from "./studio-environment.json"
import { RayOcclusion, type RayHit } from "./RayOcclusion"

type V3 = [number, number, number]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const normalize = (v: V3): V3 => {
  const l = Math.hypot(...v) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
const W = 96,
  H = 48,
  SAMPLES = 128
const ROUGHNESSES = [0.04, 0.1, 0.18, 0.28, 0.4, 0.55, 0.7, 0.85, 1]
const SHADOW_SAMPLES = 4,
  REFLECTION_SAMPLES = 4,
  DIFFUSE_SAMPLES = 2
const lobes = environment.lobes.map((l) => ({
  ...l,
  direction: normalize(l.direction as V3),
  color: l.color as V3,
}))

function radicalInverse(value: number) {
  let result = 0,
    factor = 0.5
  while (value) {
    result += (value & 1) * factor
    value >>>= 1
    factor *= 0.5
  }
  return result
}

function basis(n: V3): [V3, V3] {
  const t = normalize(Math.abs(n[1]) < 0.999 ? [n[2], 0, -n[0]] : [1, 0, 0])
  return [
    t,
    [
      n[1] * t[2] - n[2] * t[1],
      n[2] * t[0] - n[0] * t[2],
      n[0] * t[1] - n[1] * t[0],
    ],
  ]
}
function orient(x: number, y: number, z: number, n: V3, t: V3, b: V3): V3 {
  return [
    t[0] * x + b[0] * y + n[0] * z,
    t[1] * x + b[1] * y + n[1] * z,
    t[2] * x + b[2] * y + n[2] * z,
  ]
}

type Lookup = [number, number, number, number, number, number]

function tableLookup(n: V3): Lookup {
  const x = (Math.atan2(n[2], n[0]) / (2 * Math.PI) + 0.5) * W - 0.5
  const y = Math.max(
    0,
    Math.min(
      H - 1,
      (Math.acos(Math.max(-1, Math.min(1, n[1]))) / Math.PI) * H - 0.5,
    ),
  )
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy
  const a = ((ix % W) + W) % W,
    b = (a + 1) % W,
    c = Math.min(H - 1, iy + 1)
  return [iy * W + a, iy * W + b, c * W + a, c * W + b, fx, fy]
}

function sampleTable(
  table: Float32Array | Float64Array,
  lookup: Lookup,
): number {
  const [i00, i10, i01, i11, fx, fy] = lookup
  return (
    (table[i00]! * (1 - fx) + table[i10]! * fx) * (1 - fy) +
    (table[i01]! * (1 - fx) + table[i11]! * fx) * fy
  )
}

interface LightingTables {
  diffuse: Float32Array[]
  specular: Float32Array[][]
  brdf: Float32Array
}
let cachedTables: LightingTables | undefined

/** Deterministic split-sum IBL, prefiltered in linear space. The spherical
 * Gaussian world is also constructed by the Blender reference script.
 */
function getTables(): LightingTables {
  if (cachedTables) return cachedTables
  const diffuse = lobes.map(() => new Float32Array(W * H))
  const specular = ROUGHNESSES.map(() =>
    lobes.map(() => new Float32Array(W * H)),
  )
  const diffuseSamples = Array.from({ length: SAMPLES }, (_, i) => {
    const phi = 2 * Math.PI * radicalInverse(i),
      r = Math.sqrt((i + 0.5) / SAMPLES)
    return [r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(1 - r * r)] as V3
  })
  const halfSamples = ROUGHNESSES.map((rough) =>
    Array.from({ length: SAMPLES }, (_, i) => {
      const phi = 2 * Math.PI * radicalInverse(i),
        u = (i + 0.5) / SAMPLES,
        a = rough * rough
      const cos = Math.sqrt((1 - u) / (1 + (a * a - 1) * u)),
        sin = Math.sqrt(1 - cos * cos)
      return [sin * Math.cos(phi), sin * Math.sin(phi), cos] as V3
    }),
  )
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const theta = ((y + 0.5) / H) * Math.PI,
        phi = ((x + 0.5) / W - 0.5) * 2 * Math.PI
      const n: V3 = [
        Math.sin(theta) * Math.cos(phi),
        Math.cos(theta),
        Math.sin(theta) * Math.sin(phi),
      ]
      const [t, b] = basis(n),
        index = y * W + x
      for (const s of diffuseSamples) {
        const l = orient(...s, n, t, b)
        for (let j = 0; j < lobes.length; j++)
          diffuse[j]![index]! +=
            Math.exp(lobes[j]!.sharpness * (dot(l, lobes[j]!.direction) - 1)) /
            SAMPLES
      }
      for (let r = 0; r < ROUGHNESSES.length; r++) {
        let weight = 0
        for (const s of halfSamples[r]!) {
          const h = orient(...s, n, t, b),
            nh = dot(n, h)
          const l: V3 = [
            2 * nh * h[0] - n[0],
            2 * nh * h[1] - n[1],
            2 * nh * h[2] - n[2],
          ]
          const nl = Math.max(0, dot(n, l))
          weight += nl
          for (let j = 0; j < lobes.length; j++)
            specular[r]![j]![index]! +=
              Math.exp(
                lobes[j]!.sharpness * (dot(l, lobes[j]!.direction) - 1),
              ) * nl
        }
        for (let j = 0; j < lobes.length; j++)
          specular[r]![j]![index]! /= Math.max(weight, 1e-8)
      }
    }
  // GGX/Smith visibility and Schlick Fresnel BRDF integration.
  const brdf = new Float32Array(64 * 64 * 2)
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const rough = (y + 0.5) / 64,
        nv = (x + 0.5) / 64,
        a = rough * rough,
        a2 = a * a
      const v: V3 = [Math.sqrt(1 - nv * nv), 0, nv]
      let A = 0,
        B = 0
      for (let i = 0; i < SAMPLES; i++) {
        const u = (i + 0.5) / SAMPLES,
          phi = 2 * Math.PI * radicalInverse(i)
        const nh = Math.sqrt((1 - u) / (1 + (a2 - 1) * u)),
          sin = Math.sqrt(1 - nh * nh)
        const h: V3 = [sin * Math.cos(phi), sin * Math.sin(phi), nh],
          vh = Math.max(0, dot(v, h))
        const nl = 2 * vh * nh - nv
        if (nl <= 0) continue
        const gv = (2 * nv) / (nv + Math.sqrt(a2 + (1 - a2) * nv * nv))
        const gl = (2 * nl) / (nl + Math.sqrt(a2 + (1 - a2) * nl * nl))
        const vis = (gv * gl * vh) / Math.max(nh * nv, 1e-8),
          f = (1 - vh) ** 5
        A += (1 - f) * vis
        B += f * vis
      }
      const index = (y * 64 + x) * 2
      brdf[index] = A / SAMPLES
      brdf[index + 1] = B / SAMPLES
    }
  cachedTables = { diffuse, specular, brdf }
  return cachedTables
}

export class StudioLighting {
  private tables = getTables()
  private occlusion: RayOcclusion
  private eye: V3
  private shadowDirections: {
    parallel: V3
    perpendicular: V3
    cross: V3
  }[][]
  private diffuseCache = new WeakMap<Material, { normal: V3; irradiance: V3 }>()
  private reflectionSamples = new Map<number, V3[]>()
  private normalDiffuseCache = new WeakMap<
    Material,
    { normal: V3; values: number[] }
  >()
  private specularCache = new Map<number, Float64Array[]>()

  private blendedSpecular(rough: number, level: number, blend: number) {
    const cached = this.specularCache.get(rough)
    if (cached) return cached
    // Bound per-render memory when a scene has many distinct roughness values.
    if (this.specularCache.size >= 16) return null
    const tables = lobes.map((_, j) => {
      const lo = this.tables.specular[level]![j]!,
        hi = this.tables.specular[level + 1]![j]!,
        table = new Float64Array(W * H)
      for (let i = 0; i < table.length; i++)
        table[i] = lo[i]! * (1 - blend) + hi[i]! * blend
      return table
    })
    this.specularCache.set(rough, tables)
    return tables
  }

  constructor(drawCalls: DrawCall[], camera: Camera) {
    this.occlusion = new RayOcclusion(drawCalls)
    const world = mat4.invert(mat4.create(), camera.view)
    if (!world)
      throw new Error("Realistic rendering requires an invertible camera view.")
    this.eye = [world[12]!, world[13]!, world[14]!]
    // Four stratified directions per softbox. Supersampling and the geometry
    // denoiser integrate pixel-rotated samples without crossing material edges.
    // Fixed sampling makes snapshots
    // reproducible; visibility comes from geometry rather than painted AO.
    this.shadowDirections = lobes.map((l) => {
      const [t, b] = basis(l.direction)
      return Array.from({ length: SHADOW_SAMPLES }, (_, i) => {
        const u = (i + 0.5) / SHADOW_SAMPLES,
          cos = 1 + Math.log(1 - u) / l.sharpness,
          sin = Math.sqrt(Math.max(0, 1 - cos * cos)),
          phi = 2 * Math.PI * radicalInverse(i)
        const direction = orient(
          sin * Math.cos(phi),
          sin * Math.sin(phi),
          cos,
          l.direction,
          t,
          b,
        )
        const parallel = dot(direction, l.direction)
        return {
          parallel: l.direction.map((v) => v * parallel) as V3,
          perpendicular: direction.map(
            (v, k) => v - l.direction[k]! * parallel,
          ) as V3,
          cross: [
            l.direction[1] * direction[2] - l.direction[2] * direction[1],
            l.direction[2] * direction[0] - l.direction[0] * direction[2],
            l.direction[0] * direction[1] - l.direction[1] * direction[0],
          ] as V3,
        }
      })
    })
  }

  private bounceRadiance(hit: RayHit, incoming: V3): V3 {
    const metal = Math.max(0, Math.min(1, hit.material.metallicFactor ?? 1))
    let cached = this.diffuseCache.get(hit.material)
    if (!cached || cached.normal.some((v, k) => !Object.is(v, hit.normal[k]))) {
      const irradiance = [...environment.ambient] as V3
      const lookup = tableLookup(hit.normal)
      for (let j = 0; j < lobes.length; j++) {
        const value = sampleTable(this.tables.diffuse[j]!, lookup)
        for (let k = 0; k < 3; k++)
          irradiance[k]! += value * lobes[j]!.color[k]!
      }
      cached = { normal: [...hit.normal] as V3, irradiance }
      this.diffuseCache.set(hit.material, cached)
    }
    const irradiance = cached.irradiance
    const base = hit.material.baseColorFactor
    const rough = Math.max(0.04, Math.min(1, hit.material.roughnessFactor ?? 1))
    const nv = Math.max(0.001, -dot(hit.normal, incoming))
    const reflected: V3 = [
      2 * nv * hit.normal[0] + incoming[0],
      2 * nv * hit.normal[1] + incoming[1],
      2 * nv * hit.normal[2] + incoming[2],
    ]
    let level = 0
    while (level < ROUGHNESSES.length - 2 && ROUGHNESSES[level + 1]! < rough)
      level++
    const blend =
      (rough - ROUGHNESSES[level]!) /
      (ROUGHNESSES[level + 1]! - ROUGHNESSES[level]!)
    const index =
      (Math.min(63, Math.floor(rough * 64)) * 64 +
        Math.min(63, Math.floor(nv * 64))) *
      2
    const A = this.tables.brdf[index]!,
      B = this.tables.brdf[index + 1]!
    const radiance: V3 = irradiance.map(
      (c, k) => c * base[k]! * (1 - metal) * 0.96,
    ) as V3
    const pref: V3 = [...environment.ambient] as V3
    const reflectedLookup = tableLookup(reflected)
    const specularTables = this.blendedSpecular(rough, level, blend)
    for (let j = 0; j < lobes.length; j++) {
      const value = specularTables
        ? sampleTable(specularTables[j]!, reflectedLookup)
        : sampleTable(this.tables.specular[level]![j]!, reflectedLookup) *
            (1 - blend) +
          sampleTable(this.tables.specular[level + 1]![j]!, reflectedLookup) *
            blend
      for (let k = 0; k < 3; k++) pref[k]! += value * lobes[j]!.color[k]!
    }
    for (let k = 0; k < 3; k++)
      radiance[k]! +=
        pref[k]! * ((0.04 * (1 - metal) + base[k]! * metal) * A + B)
    return radiance
  }

  shade(
    position: V3,
    n: V3,
    base: V3,
    material: Material,
    sampleIndex = 0,
  ): V3 {
    const v = normalize([
      this.eye[0] - position[0],
      this.eye[1] - position[1],
      this.eye[2] - position[2],
    ])
    const nv = Math.max(0.001, dot(n, v))
    const reflected: V3 = [
      2 * nv * n[0] - v[0],
      2 * nv * n[1] - v[1],
      2 * nv * n[2] - v[2],
    ]
    const origin: V3 = [
      position[0] + n[0] * this.occlusion.bias,
      position[1] + n[1] * this.occlusion.bias,
      position[2] + n[2] * this.occlusion.bias,
    ]
    const metal = Math.max(0, Math.min(1, material.metallicFactor ?? 1))
    const rough = Math.max(0.04, Math.min(1, material.roughnessFactor ?? 1))
    let level = 0
    while (level < ROUGHNESSES.length - 2 && ROUGHNESSES[level + 1]! < rough)
      level++
    const blend =
      (rough - ROUGHNESSES[level]!) /
      (ROUGHNESSES[level + 1]! - ROUGHNESSES[level]!)
    const bx = Math.min(63, Math.floor(nv * 64)),
      by = Math.min(63, Math.floor(rough * 64)),
      bi = (by * 64 + bx) * 2
    const A = this.tables.brdf[bi]!,
      B = this.tables.brdf[bi + 1]!
    const f0: V3 = base.map((c) => 0.04 * (1 - metal) + c * metal) as V3
    const color: V3 = base.map(
      (c, j) => environment.ambient[j]! * c * (1 - metal) * 0.96,
    ) as V3
    const specColor: V3 = f0.map(
      (c, j) => environment.ambient[j]! * (c * A + B),
    ) as V3
    // Rotate each pixel's stratification instead of producing visible bands in
    // soft shadows. Supersampling integrates these deterministic samples.
    let bits = sampleIndex + 1
    bits = Math.imul(bits ^ (bits >>> 16), 0x7feb352d)
    bits = Math.imul(bits ^ (bits >>> 15), 0x846ca68b)
    const hash = ((bits ^ (bits >>> 16)) >>> 0) / 4294967296
    const phase = hash * 2 * Math.PI,
      cosPhase = Math.cos(phase),
      sinPhase = Math.sin(phase)
    // Flat PCB/IC faces share an identical normal across many pixels. Reuse
    // only the unshadowed lookup; visibility still comes from fresh scene rays.
    let normalDiffuse = this.normalDiffuseCache.get(material)
    if (
      !normalDiffuse ||
      normalDiffuse.normal.some((value, k) => !Object.is(value, n[k]))
    ) {
      const lookup = tableLookup(n)
      normalDiffuse = {
        normal: [...n] as V3,
        values: this.tables.diffuse.map((table) => sampleTable(table, lookup)),
      }
      this.normalDiffuseCache.set(material, normalDiffuse)
    }
    const reflectedLookup = tableLookup(reflected)
    const specularTables = this.blendedSpecular(rough, level, blend)
    for (let j = 0; j < lobes.length; j++) {
      const dirs = this.shadowDirections[j]!
      let visible = 0,
        total = 0
      for (const { parallel, perpendicular, cross } of dirs) {
        const l: V3 = [
          parallel[0] + perpendicular[0] * cosPhase + cross[0] * sinPhase,
          parallel[1] + perpendicular[1] * cosPhase + cross[1] * sinPhase,
          parallel[2] + perpendicular[2] * cosPhase + cross[2] * sinPhase,
        ]
        const weight = Math.max(0, dot(n, l))
        total += weight
        if (weight > 0 && !this.occlusion.occluded(origin, l)) visible += weight
      }
      const visibility = total > 0 ? visible / total : 1
      const diffuse = normalDiffuse.values[j]! * visibility
      const specular =
        (specularTables
          ? sampleTable(specularTables[j]!, reflectedLookup)
          : sampleTable(this.tables.specular[level]![j]!, reflectedLookup) *
              (1 - blend) +
            sampleTable(this.tables.specular[level + 1]![j]!, reflectedLookup) *
              blend) * visibility
      for (let k = 0; k < 3; k++) {
        color[k]! +=
          lobes[j]!.color[k]! * base[k]! * (1 - metal) * 0.96 * diffuse
        specColor[k]! += lobes[j]!.color[k]! * (f0[k]! * A + B) * specular
      }
    }
    // One diffuse bounce replaces blocked ambient with scene radiance. In a
    // product shot the floor is essential fill, especially for black surfaces.
    const [t, b] = basis(n)
    let blocked = 0
    for (let i = 0; metal < 1 && i < DIFFUSE_SAMPLES; i++) {
      const phi = (i * 2 * Math.PI) / DIFFUSE_SAMPLES + phase,
        l = orient(
          0.7 * Math.cos(phi),
          0.7 * Math.sin(phi),
          Math.sqrt(0.51),
          n,
          t,
          b,
        )
      const hit = this.occlusion.trace(origin, l)
      if (hit) {
        blocked++
        const bounce = this.bounceRadiance(hit, l)
        for (let k = 0; k < 3; k++)
          color[k]! +=
            (bounce[k]! * base[k]! * (1 - metal) * 0.96) / DIFFUSE_SAMPLES
      }
    }
    const ao = 1 - blocked / DIFFUSE_SAMPLES
    for (let k = 0; k < 3; k++)
      color[k]! -=
        environment.ambient[k]! * (1 - ao) * base[k]! * (1 - metal) * 0.96
    // Rough GGX reflection rays, with a single diffuse secondary hit. This
    // captures floor reflections in the shaft/end plates without path tracing.
    const [rt, rb] = basis(reflected),
      bounce: V3 = [0, 0, 0]
    let hitWeight = 0,
      totalWeight = 0
    // The GGX half-vector distribution depends only on scalar roughness.
    // Rotate cached local samples per pixel instead of repeating sqrt/trig.
    let samples = this.reflectionSamples.get(rough)
    if (!samples) {
      samples = Array.from({ length: REFLECTION_SAMPLES }, (_, i) => {
        const u = (i + 0.5) / REFLECTION_SAMPLES,
          phi = 2 * Math.PI * radicalInverse(i),
          a = rough * rough,
          nh = Math.sqrt((1 - u) / (1 + (a * a - 1) * u)),
          sin = Math.sqrt(1 - nh * nh)
        return [sin * Math.cos(phi), sin * Math.sin(phi), nh] as V3
      })
      this.reflectionSamples.set(rough, samples)
    }
    for (const [sx, sy, nh] of samples) {
      const h = orient(
        sx * cosPhase - sy * sinPhase,
        sx * sinPhase + sy * cosPhase,
        nh,
        reflected,
        rt,
        rb,
      )
      const l: V3 = [
        2 * nh * h[0] - reflected[0],
        2 * nh * h[1] - reflected[1],
        2 * nh * h[2] - reflected[2],
      ]
      const weight = Math.max(0, dot(reflected, l))
      totalWeight += weight
      if (weight === 0 || dot(n, l) <= 0) continue
      const hit = this.occlusion.trace(origin, l)
      if (hit) {
        hitWeight += weight
        const radiance = this.bounceRadiance(hit, l)
        for (let k = 0; k < 3; k++) bounce[k]! += radiance[k]! * weight
      }
    }
    for (let k = 0; k < 3; k++)
      color[k]! +=
        specColor[k]! * (1 - hitWeight / Math.max(totalWeight, 1e-8)) +
        (bounce[k]! / Math.max(totalWeight, 1e-8)) * (f0[k]! * A + B)
    return color
  }
}
