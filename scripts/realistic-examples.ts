import { readFile, mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { mat4 } from "gl-matrix"
import { decode, encode } from "fast-png"
import {
  createSceneFromGLTF,
  computeWorldAABB,
  loadGLTFWithResourcesFromURL,
  renderDrawCalls,
  encodePNG,
  type DrawCall,
  type RenderOptionsInput,
} from "../lib"
import { sideBySide, sha256 } from "./nema17-comparison"

export const EXAMPLES = [
  {
    id: "arduino-uno",
    title: "Arduino Uno",
    source: "tests/fixtures/assets/arduino-uno.glb",
    direction: [1, 1.6, 1.35],
  },
  {
    id: "usb-c-pcb",
    title: "USB C PCB",
    source: "tests/basics/circuit.gltf",
    direction: [1, 1.7, 1.4],
  },
  {
    id: "soic8",
    title: "SOIC 8 package",
    source: "tests/fixtures/assets/soic8-modelcdn.glb",
    sourceUrl: "https://modelcdn.tscircuit.com/jscad_models/soic8.glb",
    direction: [1, 1.3, 1.6],
  },
  {
    id: "usb-enclosure",
    title: "USB enclosure",
    source: "tests/fixtures/assets/enclosure-fdm-box-usb-cutout.glb",
    direction: [0.8, 1.3, 1.8],
  },
] as const
export type Example = (typeof EXAMPLES)[number]
const root = new URL("../", import.meta.url)
export const exampleDirectory = fileURLToPath(
  new URL("tests/fixtures/realistic-examples/", root),
)

export async function loadLocalDrawCalls(sourceURL: URL) {
  // The universal loader handles JSON/GLB and embedded textures. A file-backed
  // fetch implementation keeps these example ports entirely offline.
  const loaded = await loadGLTFWithResourcesFromURL(sourceURL.href, {
    fetchImpl: async (url) => {
      const bytes = await readFile(new URL(url))
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        url,
        arrayBuffer: async () =>
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer,
      }
    },
  })
  return createSceneFromGLTF(loaded.gltf, loaded.resources).drawCalls
}

export async function prepareExample(example: Example) {
  const sourceURL = new URL(example.source, root)
  const drawCalls = await loadLocalDrawCalls(sourceURL)
  if (example.id === "soic8") {
    // The refreshed Model CDN asset is Z-up and uses vertex colors without
    // material definitions. Preserve its geometry, remap Z-up to Y-up, and
    // author steel leads and a molded plastic body for both comparison panels.
    const rotation = mat4.fromXRotation(mat4.create(), -Math.PI / 2)
    for (const dc of drawCalls) {
      dc.model = mat4.multiply(mat4.create(), rotation, dc.model)
      const isBody = dc.colors && dc.colors[0]! < 0.5
      dc.material = {
        ...dc.material,
        metallicFactor: isBody ? 0 : 1,
        roughnessFactor: isBody ? 0.55 : 0.22,
        baseColorFactor: isBody
          ? [0.075, 0.075, 0.075, 1]
          : [0.65, 0.68, 0.72, 1],
      }
    }
  }
  // Technical hidden-edge overlays are disabled in both photographic views.
  for (const dc of drawCalls) dc.showHiddenEdges = false
  const bounds = computeWorldAABB(drawCalls)
  const center = bounds.min.map((v, i) => (v + bounds.max[i]!) / 2) as [
    number,
    number,
    number,
  ]
  const extent = bounds.max.map((v, i) => v - bounds.min[i]!)
  const radius = Math.hypot(...extent) / 2,
    maxSize = Math.max(...extent),
    fov = 35
  const distance = (radius / Math.tan((fov * Math.PI) / 360)) * 1.15
  const directionLength = Math.hypot(...example.direction)
  const camPos = center.map(
    (v, i) => v + (example.direction[i]! / directionLength) * distance,
  ) as [number, number, number]
  const y = bounds.min[1]! - maxSize * 0.006,
    s = maxSize * 8
  const floor: DrawCall = {
    positions: new Float32Array([
      center[0] - s,
      y,
      center[2] - s,
      center[0] + s,
      y,
      center[2] - s,
      center[0] + s,
      y,
      center[2] + s,
      center[0] - s,
      y,
      center[2] + s,
    ]),
    normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    uvs: null,
    indices: new Uint32Array([0, 2, 1, 0, 3, 2]),
    model: mat4.create(),
    material: {
      baseColorFactor: [0.72, 0.74, 0.78, 1],
      baseColorTexture: null,
      metallicFactor: 0,
      roughnessFactor: 0.65,
      alphaMode: "OPAQUE",
    },
  }
  const options: RenderOptionsInput = {
    camPos,
    lookAt: center,
    up: "y+",
    fov,
    backgroundColor: "#e5e7eb",
    grid: false,
    gamma: true,
  }
  return {
    drawCalls: [...drawCalls, floor],
    options,
    sourceSha256: sha256(await readFile(sourceURL)),
  }
}

export async function renderExample(
  example: Example,
  size = 600,
  supersampling = 2,
) {
  const prepared = await prepareExample(example)
  const options = {
    ...prepared.options,
    width: size,
    height: size,
    supersampling,
  }
  const start = performance.now()
  const realistic = await encodePNG(
    renderDrawCalls(prepared.drawCalls, { ...options, realistic: true }).bitmap,
  )
  const seconds = (performance.now() - start) / 1000
  const defaultStart = performance.now()
  const legacy = await encodePNG(
    renderDrawCalls(prepared.drawCalls, { ...options, realistic: false })
      .bitmap,
  )
  const defaultSeconds = (performance.now() - defaultStart) / 1000
  const comparison = sideBySide(legacy, realistic, [
    `${example.title} default`,
    `${example.title} realistic`,
  ])
  return {
    realistic,
    legacy,
    comparison,
    metadata: {
      ...example,
      sourceSha256: prepared.sourceSha256,
      options,
      realisticSeconds: seconds,
      defaultSeconds,
      slowdown: seconds / defaultSeconds,
      materialAuthoring:
        example.id === "soic8"
          ? "Plastic body and steel leads; Z-up remapped to Y-up"
          : "Original material definitions",
      hiddenEdges: false,
      studioFloor: true,
    },
  }
}

export function gallery(images: Uint8Array[]) {
  if (images.length !== 4) throw new Error("Expected four example images")
  const rows = [
    sideBySide(images[0]!, images[1]!, [EXAMPLES[0].title, EXAMPLES[1].title]),
    sideBySide(images[2]!, images[3]!, [EXAMPLES[2].title, EXAMPLES[3].title]),
  ].map((bytes) => decode(bytes))
  const width = rows[0]!.width,
    height = rows[0]!.height * 2,
    data = new Uint8Array(width * height * 4)
  data.set(rows[0]!.data)
  data.set(rows[1]!.data, rows[0]!.data.length)
  return encode({ width, height, data, channels: 4 })
}

if (import.meta.main) {
  const output = process.argv[2] ?? exampleDirectory
  await mkdir(output, { recursive: true })
  const results = []
  for (const example of EXAMPLES) {
    console.log(`Rendering ${example.title}…`)
    const result = await renderExample(example)
    for (const [suffix, bytes] of [
      ["realistic", result.realistic],
      ["default", result.legacy],
      ["comparison", result.comparison],
    ] as const)
      await writeFile(`${output}/${example.id}-${suffix}.png`, bytes)
    console.log(
      `${example.title}: default ${result.metadata.defaultSeconds.toFixed(3)}s, realistic ${result.metadata.realisticSeconds.toFixed(1)}s (${result.metadata.slowdown.toFixed(1)}x)`,
    )
    results.push(result)
  }
  await writeFile(
    `${output}/gallery.png`,
    gallery(results.map((r) => r.realistic)),
  )
  await writeFile(
    `${output}/manifest.json`,
    JSON.stringify(
      results.map((r) => r.metadata),
      null,
      2,
    ) + "\n",
  )
}
