import type { mat4 } from "gl-matrix";
import type { BitmapLike } from "../image/createUint8Bitmap";

export interface Material {
	baseColorFactor: [number, number, number, number];
	baseColorTexture: BitmapLike | null;
}

export interface DrawCall {
	positions: Float32Array;
	normals: Float32Array | null;
	uvs: Float32Array | null;
	indices: Uint32Array | null;
	model: mat4;
	material: Material;
}

export interface GLTFResources {
	buffers: Uint8Array[];
	images: BitmapLike[];
}

export interface GLTFScene {
	drawCalls: DrawCall[];
	gltf: any;
}
