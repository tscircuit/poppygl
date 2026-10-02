import { createTextOverlayScene } from "../../tests/fixtures/text-overlay-scene"
import PoppyGlViewer from "../components/PoppyGlViewer"

const gltfUrl = `data:application/json;base64,${btoa(JSON.stringify(createTextOverlayScene().gltf))}`

export default () => (
  <main>
    <h1>Fixed text overlay</h1>
    <PoppyGlViewer gltfUrl={gltfUrl} width={800} height={600} />
  </main>
)
