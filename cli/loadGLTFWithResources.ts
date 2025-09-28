import * as fs from "node:fs";
import * as path from "node:path";
import { PassThrough } from "node:stream";
import PImage from "pureimage";
import type { BitmapLike } from "../lib/image/createUint8Bitmap";
import type { GLTFResources } from "../lib/gltf/types";

function bufferFromDataURI(uri: string): Buffer {
	const match = uri.match(/^data:.*?;base64,(.*)$/);
	if (!match) throw new Error(`Unsupported data URI: ${uri.slice(0, 64)}...`);
	return Buffer.from(match[1], "base64");
}

function isPNG(filenameOrUri: string) {
	return /\.png(\?|$)/i.test(filenameOrUri) || /image\/png/i.test(filenameOrUri);
}

function isJPG(filenameOrUri: string) {
	return /(\.jpe?g(\?|$)|image\/jpe?g)/i.test(filenameOrUri);
}

function bufferToStream(buf: Buffer) {
	const stream = new PassThrough();
	stream.end(buf);
	return stream;
}

function detectMimeTypeFromBuffer(buf: Uint8Array, hint?: string | null) {
	if (hint) return hint;
	if (
		buf.length >= 8 &&
		buf[0] === 0x89 &&
		buf[1] === 0x50 &&
		buf[2] === 0x4e &&
		buf[3] === 0x47 &&
		buf[4] === 0x0d &&
		buf[5] === 0x0a &&
		buf[6] === 0x1a &&
		buf[7] === 0x0a
	)
		return "image/png";
	if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
	return null;
}

async function decodeImageFromBuffer(buf: Buffer, mimeType?: string | null) {
	const type = detectMimeTypeFromBuffer(buf, mimeType);
	if (type === "image/png") return PImage.decodePNGFromStream(bufferToStream(buf));
	if (type === "image/jpeg" || type === "image/jpg")
		return PImage.decodeJPEGFromStream(bufferToStream(buf));
	throw new Error(`Unsupported embedded image mimeType: ${mimeType ?? "unknown"}`);
}

export async function loadGLTFWithResources(gltfPath: string): Promise<{
	gltf: any;
	resources: GLTFResources;
}> {
	const baseDir = path.dirname(gltfPath);
	const gltf = JSON.parse(await fs.promises.readFile(gltfPath, "utf8"));

	const buffers = await Promise.all(
		(gltf.buffers || []).map(async (b: any) => {
			if (b.uri && b.uri.startsWith("data:")) {
				return bufferFromDataURI(b.uri);
			}
			if (b.uri) {
				const resolved = path.resolve(baseDir, decodeURIComponent(b.uri));
				return fs.promises.readFile(resolved);
			}
			throw new Error("Buffer without uri not supported in this loader.");
		}),
	);

	const images = await Promise.all(
		(gltf.images || []).map(async (img: any) => {
			if (img.uri) {
				if (img.uri.startsWith("data:")) {
					const buf = bufferFromDataURI(img.uri);
					if (isPNG(img.uri)) return PImage.decodePNGFromStream(bufferToStream(buf));
					if (isJPG(img.uri)) return PImage.decodeJPEGFromStream(bufferToStream(buf));
					throw new Error(
						`Unsupported data-URI image type for ${img.uri.slice(0, 32)}...`,
					);
				}
				const filePath = path.resolve(baseDir, decodeURIComponent(img.uri));
				if (isPNG(img.uri)) return PImage.decodePNGFromStream(fs.createReadStream(filePath));
				if (isJPG(img.uri)) return PImage.decodeJPEGFromStream(fs.createReadStream(filePath));
				try {
					return await PImage.decodePNGFromStream(fs.createReadStream(filePath));
				} catch (err) {
					if (err) {
						return PImage.decodeJPEGFromStream(fs.createReadStream(filePath));
					}
					throw err;
				}
			}

			if (typeof img.bufferView === "number") {
				const bufferView = gltf.bufferViews?.[img.bufferView];
				if (!bufferView) {
					throw new Error(`Invalid image bufferView index ${img.bufferView}`);
				}
				const buffer = buffers[bufferView.buffer];
				if (!buffer) throw new Error(`Missing buffer for image bufferView ${img.bufferView}`);
				const byteOffset = bufferView.byteOffset ?? 0;
				const byteLength = bufferView.byteLength;
				if (typeof byteLength !== "number") {
					throw new Error(`bufferView ${img.bufferView} missing byteLength for image.`);
				}
				const slice = Buffer.from(buffer.buffer, buffer.byteOffset + byteOffset, byteLength);
				return decodeImageFromBuffer(slice, img.mimeType);
			}

			throw new Error(
				"images[*] entry missing uri or bufferView; unsupported in this lightweight loader.",
			);
		}) as Promise<BitmapLike>[]
	);

	return {
		gltf,
		resources: {
			buffers: buffers as unknown as Uint8Array[],
			images,
		},
	};
}
