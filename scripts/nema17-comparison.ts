import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { decode, encode } from "fast-png"
import {
  glyphAdvanceRatio,
  glyphLineAlphabet,
  textMetrics,
} from "@tscircuit/alphabet"
import { renderGLTFToPNGFromGLB, type RenderOptionsInput } from "../lib"

export const fixtureDirectory = fileURLToPath(
  new URL("../tests/fixtures/nema17/", import.meta.url),
)
export const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex")

export async function readNema17Fixture() {
  const reference = JSON.parse(
    await readFile(`${fixtureDirectory}/reference.json`, "utf8"),
  )
  const [glb, blender, blend, environment] = await Promise.all([
    readFile(`${fixtureDirectory}/nema17.glb`),
    readFile(`${fixtureDirectory}/blender-cycles.png`),
    readFile(`${fixtureDirectory}/nema17.blend`),
    readFile(new URL("../lib/render/studio-environment.json", import.meta.url)),
  ])
  for (const [bytes, hash, name] of [
    [glb, reference.glbSha256, "GLB"],
    [blender, reference.referenceSha256, "Blender PNG"],
    [blend, reference.blendSha256, "Blender scene"],
    [environment, reference.environmentSha256, "lighting environment"],
  ] as const) {
    if (sha256(bytes) !== hash)
      throw new Error(
        `${name} differs from the committed Blender reference manifest. Regenerate deliberately.`,
      )
  }
  const options: RenderOptionsInput = {
    width: reference.width,
    height: reference.height,
    fov: reference.fov,
    camPos: reference.camPos,
    lookAt: reference.lookAt,
    up: reference.up,
    gamma: true,
    supersampling: 2,
  }
  return { reference, glb, blender, options }
}

export function imageError(a: Uint8Array, b: Uint8Array) {
  const first = decode(a),
    second = decode(b)
  if (first.width !== second.width || first.height !== second.height)
    throw new Error("Comparison dimensions differ")
  let absolute = 0,
    squared = 0
  for (let i = 0; i < first.data.length; i += 4)
    for (let c = 0; c < 3; c++) {
      const error =
        (Number(first.data[i + c]) - Number(second.data[i + c])) / 255
      absolute += Math.abs(error)
      squared += error * error
    }
  const count = first.width * first.height * 3
  return { mae: absolute / count, rmse: Math.sqrt(squared / count) }
}

export function resizeReference(png: Uint8Array, size: number): Uint8Array {
  const source = decode(png),
    factor = source.width / size
  if (
    !Number.isInteger(factor) ||
    source.width !== source.height ||
    source.channels !== 4
  )
    throw new Error("Reference resize requires an integer square downsample")
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      for (let c = 0; c < 4; c++) {
        let sum = 0
        for (let j = 0; j < factor; j++)
          for (let i = 0; i < factor; i++)
            sum += Number(
              source.data[
                ((y * factor + j) * source.width + x * factor + i) * 4 + c
              ],
            )
        data[(y * size + x) * 4 + c] = Math.round(sum / (factor * factor))
      }
  return encode({ width: size, height: size, data, channels: 4 })
}

/** Font-independent labels keep the visual snapshot reproducible on CI. */
export function sideBySide(poppy: Uint8Array, blender: Uint8Array): Uint8Array {
  const images = [decode(poppy), decode(blender)],
    size = images[0]!.width,
    header = 64
  if (
    images.some(
      (i) => i.width !== size || i.height !== size || i.channels !== 4,
    )
  )
    throw new Error("Expected square RGBA renders")
  const width = size * 2,
    height = size + header,
    data = new Uint8Array(width * height * 4).fill(255)
  for (let panel = 0; panel < 2; panel++)
    for (let y = 0; y < size; y++) {
      data.set(
        images[panel]!.data.subarray(y * size * 4, (y + 1) * size * 4),
        ((y + header) * width + panel * size) * 4,
      )
    }
  const pixel = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const i = (y * width + x) * 4
    data[i] = 30
    data[i + 1] = 37
    data[i + 2] = 48
  }
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2))
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x1 + ((x2 - x1) * i) / steps),
        y = Math.round(y1 + ((y2 - y1) * i) / steps)
      pixel(x, y)
      pixel(x + 1, y)
      pixel(x, y + 1)
    }
  }
  const label = (text: string, x: number) => {
    const textWidth = Array.from(text).reduce(
      (sum, c) =>
        sum +
        (glyphAdvanceRatio[c] ??
          (c === " "
            ? textMetrics.spaceWidthRatio
            : textMetrics.glyphWidthRatio)),
      0,
    )
    const scale = Math.min(22, (size - 48) / textWidth)
    for (const c of text) {
      const glyph = glyphLineAlphabet[c] ?? glyphLineAlphabet[c.toUpperCase()]
      if (glyph)
        for (const s of glyph)
          line(
            x + s.x1 * scale,
            20 + (1 - s.y1) * scale,
            x + s.x2 * scale,
            20 + (1 - s.y2) * scale,
          )
      x +=
        (glyphAdvanceRatio[c] ??
          (c === " "
            ? textMetrics.spaceWidthRatio
            : textMetrics.glyphWidthRatio)) * scale
    }
  }
  label("PoppyGL realistic", 24)
  label("Blender Cycles 512 samples", size + 24)
  for (let y = 0; y < height; y++) pixel(size, y)
  return encode({ width, height, data, channels: 4 })
}

export async function renderNema17Comparison() {
  const { glb, blender, options } = await readNema17Fixture()
  const start = performance.now()
  const realistic = await renderGLTFToPNGFromGLB(glb, {
    ...options,
    realistic: true,
  })
  const realisticSeconds = (performance.now() - start) / 1000
  const legacy = await renderGLTFToPNGFromGLB(glb, {
    ...options,
    realistic: false,
  })
  const metrics = {
    realisticSeconds,
    realistic: imageError(realistic, blender),
    legacy: imageError(legacy, blender),
    width: options.width,
    height: options.height,
    supersampling: options.supersampling,
  }
  return {
    realistic,
    legacy,
    comparison: sideBySide(realistic, blender),
    metrics,
  }
}

if (import.meta.main) {
  const outputDirectory = process.argv[2] ?? fixtureDirectory
  await mkdir(outputDirectory, { recursive: true })
  console.log("Rendering NEMA17 against the committed Blender reference…")
  const result = await renderNema17Comparison()
  await writeFile(`${outputDirectory}/poppygl-realistic.png`, result.realistic)
  await writeFile(`${outputDirectory}/poppygl-legacy.png`, result.legacy)
  await writeFile(`${outputDirectory}/comparison.png`, result.comparison)
  await writeFile(
    `${outputDirectory}/metrics.json`,
    JSON.stringify(result.metrics, null, 2) + "\n",
  )
  console.log(result.metrics)
}
