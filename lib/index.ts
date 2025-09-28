import { renderDrawCalls } from "./render/renderDrawCalls";

export { renderDrawCalls } from "./render/renderDrawCalls";
export { resolveRenderOptions } from "./render/resolveRenderOptions";
export type { RenderResult } from "./render/renderDrawCalls";

export { createSceneFromGLTF } from "./gltf/createSceneFromGLTF";
export { computeSmoothNormals } from "./gltf/computeSmoothNormals";
export { computeWorldAABB } from "./gltf/computeWorldAABB";
export type {
	DrawCall,
	Material,
	GLTFResources,
	GLTFScene,
} from "./gltf/types";

export { buildCamera } from "./camera/buildCamera";
export type { Camera } from "./camera/buildCamera";

export { SoftwareRenderer } from "./render/SoftwareRenderer";
export type { LightSettings } from "./render/SoftwareRenderer";

export { createUint8Bitmap } from "./image/createUint8Bitmap";
export type {
	BitmapLike,
	ImageFactory,
	MutableRGBA,
	RGBA,
} from "./image/createUint8Bitmap";

export {
	DEFAULT_LIGHT_DIR,
	DEFAULT_RENDER_OPTIONS,
	getDefaultRenderOptions,
} from "./render/getDefaultRenderOptions";
export type {
	RenderOptions,
	RenderOptionsInput,
} from "./render/getDefaultRenderOptions";

export function renderSceneFromGLTF(
	scene: import("./gltf/types").GLTFScene,
	options?: import("./render/getDefaultRenderOptions").RenderOptionsInput,
	imageFactory?: import("./image/createUint8Bitmap").ImageFactory,
) {
	return renderDrawCalls(scene.drawCalls, options, imageFactory);
}
