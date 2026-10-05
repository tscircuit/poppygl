import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { writeFile } from "node:fs/promises"

// Install the converter in a separate folder to keep native export dependencies
// out of the renderer: bun add --cwd work/board-export
// circuit-json-to-gltf@0.0.144 @resvg/resvg-js@2.6.2
const [output = "board.glb", converterDirectory = "work/board-export"] =
  process.argv.slice(2)
const releaseId = "e8d285f7-c3d8-46f5-9a54-344fdde0124e"
const url = `https://api.tscircuit.com/package_files/get?package_release_id=${releaseId}&file_path=dist%2Findex%2Fcircuit.json`
const response = await fetch(url)
if (!response.ok) throw Error(`Board download failed: ${response.status}`)
const data = (await response.json()) as {
  package_file: { content_text: string }
}
const circuit = JSON.parse(data.package_file.content_text)
const modulePath = Bun.resolveSync(
  "circuit-json-to-gltf",
  resolve(converterDirectory),
)
const { convertCircuitJsonToGltf } = await import(modulePath)
const glb = Buffer.from(
  await convertCircuitJsonToGltf(circuit, {
    format: "glb",
    projectBaseUrl: "https://api.tscircuit.com",
  }),
)
await writeFile(output, glb)
await writeFile(
  `${output}.provenance.json`,
  JSON.stringify(
    {
      source: "https://tscircuit.com/imrishabh18/rp2040-motor-controller",
      version: "1.0.42",
      releaseId,
      circuitJsonUrl: url,
      circuitJsonSha256: createHash("sha256")
        .update(data.package_file.content_text)
        .digest("hex"),
      glbSha256: createHash("sha256").update(glb).digest("hex"),
      converter: "circuit-json-to-gltf@0.0.144",
      svgRenderer: "@resvg/resvg-js@2.6.2",
    },
    null,
    2,
  ),
)
console.log(`Saved ${output} from board release 1.0.42`)
