import { loadGLTFWithResourcesFromPath } from "./loadGLTFWithResourcesFromPath"
import {
  type LoadGLTFWithResourcesFromURLOptions,
  loadGLTFWithResourcesFromURL,
} from "./loadGLTFWithResourcesFromURL"
import type { GLTFResources } from "./types"

function isNodeRuntime(): boolean {
  const runtimeProcess = (
    globalThis as {
      process?: { versions?: { node?: string } }
    }
  ).process
  return !!runtimeProcess?.versions?.node
}

function isFetchableURLInNode(source: string): boolean {
  try {
    const url = new URL(source)
    return ["http:", "https:", "data:", "blob:"].includes(url.protocol)
  } catch {
    return false
  }
}

function parseGLTFJSON(source: string): any | null {
  try {
    return JSON.parse(source)
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}

export async function resolveGLTFInput(
  source: string,
  options: LoadGLTFWithResourcesFromURLOptions = {},
): Promise<{ gltf: any; resources: GLTFResources }> {
  const gltf = parseGLTFJSON(source)
  if (gltf !== null) {
    return {
      gltf,
      resources: { buffers: [], images: [] },
    }
  }

  if (!isNodeRuntime()) {
    return loadGLTFWithResourcesFromURL(source, options)
  }

  if (isFetchableURLInNode(source)) {
    return loadGLTFWithResourcesFromURL(source, options)
  }

  return loadGLTFWithResourcesFromPath(source)
}
