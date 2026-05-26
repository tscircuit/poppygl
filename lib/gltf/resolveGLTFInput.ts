import { loadGLTFWithResourcesFromPath } from "./loadGLTFWithResourcesFromPath"
import { loadGLTFWithResourcesFromURL } from "./loadGLTFWithResourcesFromURL"
import type { GLTFResources } from "./types"

function isNodeRuntime(): boolean {
  const runtimeProcess = (
    globalThis as {
      process?: { versions?: { node?: string } }
    }
  ).process
  return !!runtimeProcess?.versions?.node
}

function shouldLoadFromURLInNode(source: string): boolean {
  return (
    /^(https?:)?\/\//i.test(source) ||
    source.startsWith("data:") ||
    source.startsWith("blob:")
  )
}

export async function resolveGLTFInput(
  source: string,
): Promise<{ gltf: any; resources: GLTFResources }> {
  try {
    return {
      gltf: JSON.parse(source),
      resources: { buffers: [], images: [] },
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
  }

  if (!isNodeRuntime() || shouldLoadFromURLInNode(source)) {
    return loadGLTFWithResourcesFromURL(source)
  }

  return loadGLTFWithResourcesFromPath(source)
}
