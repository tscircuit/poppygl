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

function sampleTable(table: Float32Array, n: V3): number {
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
  return (
    (table[iy * W + a]! * (1 - fx) + table[iy * W + b]! * fx) * (1 - fy) +
    (table[c * W + a]! * (1 - fx) + table[c * W + b]! * fx) * fy
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
  private shadowDirections: V3[][]

  constructor(drawCalls: DrawCall[], camera: Camera) {
    this.occlusion = new RayOcclusion(drawCalls)
    const world = mat4.invert(mat4.create(), camera.view)
    if (!world)
      throw new Error("Realistic rendering requires an invertible camera view.")
    this.eye = [world[12]!, world[13]!, world[14]!]
    // Eight stratified directions per softbox. Fixed sampling makes snapshots
    // reproducible; visibility comes from geometry rather than painted AO.
    this.shadowDirections = lobes.map((l) => {
      const [t, b] = basis(l.direction)
      return Array.from({ length: 8 }, (_, i) => {
        const u = (i + 0.5) / 8,
          cos = 1 + Math.log(1 - u) / l.sharpness,
          sin = Math.sqrt(Math.max(0, 1 - cos * cos)),
          phi = 2 * Math.PI * radicalInverse(i)
        return orient(
          sin * Math.cos(phi),
          sin * Math.sin(phi),
          cos,
          l.direction,
          t,
          b,
        )
      })
    })
  }

  private bounceRadiance(hit: RayHit, incoming: V3): V3 {
    const metal = Math.max(0, Math.min(1, hit.material.metallicFactor ?? 1))
    const irradiance: V3 = [...environment.ambient] as V3
    for (let j = 0; j < lobes.length; j++) {
      const value = sampleTable(this.tables.diffuse[j]!, hit.normal)
      for (let k = 0; k < 3; k++) irradiance[k]! += value * lobes[j]!.color[k]!
    }
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
    for (let j = 0; j < lobes.length; j++) {
      const value =
        sampleTable(this.tables.specular[level]![j]!, reflected) * (1 - blend) +
        sampleTable(this.tables.specular[level + 1]![j]!, reflected) * blend
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
    for (let j = 0; j < lobes.length; j++) {
      const dirs = this.shadowDirections[j]!
      let visible = 0,
        total = 0
      const axis = lobes[j]!.direction
      for (const direction of dirs) {
        const parallel = dot(direction, axis)
        const cross: V3 = [
          axis[1] * direction[2] - axis[2] * direction[1],
          axis[2] * direction[0] - axis[0] * direction[2],
          axis[0] * direction[1] - axis[1] * direction[0],
        ]
        const l: V3 = direction.map(
          (value, k) =>
            axis[k]! * parallel +
            (value - axis[k]! * parallel) * cosPhase +
            cross[k]! * sinPhase,
        ) as V3
        const weight = Math.max(0, dot(n, l))
        total += weight
        if (weight > 0 && !this.occlusion.occluded(origin, l)) visible += weight
      }
      const visibility = total > 0 ? visible / total : 1
      const diffuse = sampleTable(this.tables.diffuse[j]!, n) * visibility
      const specular =
        (sampleTable(this.tables.specular[level]![j]!, reflected) *
          (1 - blend) +
          sampleTable(this.tables.specular[level + 1]![j]!, reflected) *
            blend) *
        visibility
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
    for (let i = 0; i < 4; i++) {
      const phi = (i * Math.PI) / 2 + phase,
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
          color[k]! += (bounce[k]! * base[k]! * (1 - metal) * 0.96) / 4
      }
    }
    const ao = 1 - blocked / 4
    for (let k = 0; k < 3; k++)
      color[k]! -=
        environment.ambient[k]! * (1 - ao) * base[k]! * (1 - metal) * 0.96
    // Rough GGX reflection rays, with a single diffuse secondary hit. This
    // captures floor reflections in the shaft/end plates without path tracing.
    const [rt, rb] = basis(reflected),
      bounce: V3 = [0, 0, 0]
    let hitWeight = 0,
      totalWeight = 0
    for (let i = 0; i < 8; i++) {
      const u = (i + 0.5) / 8,
        phi = 2 * Math.PI * radicalInverse(i) + phase,
        a = rough * rough
      const nh = Math.sqrt((1 - u) / (1 + (a * a - 1) * u)),
        sin = Math.sqrt(1 - nh * nh)
      const h = orient(
        sin * Math.cos(phi),
        sin * Math.sin(phi),
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
