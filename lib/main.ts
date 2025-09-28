#!/usr/bin/env node
/**
 * Lightweight glTF 2.0 software renderer (no WebGL).
 * Dependencies: gl-matrix, pureimage (Node.js)
 *
 * Features:
 *  - .gltf (JSON), external .bin (and data-URI buffers)
 *  - TRIANGLES only
 *  - positions, indices, (optionally) normals & texcoords
 *  - baseColorFactor + baseColorTexture (PNG/JPG via images[*].uri)
 *  - simple Lambert + ambient, z-buffer, backface culling
 *  - perspective-correct interpolation (UVs, normals)
 *  - auto-fit camera, or override via CLI
 *
 * Usage:
 *  node render_gltf_soft.js model.gltf --out out.png --w 960 --h 540 --fov 60
 *
 * Flags (all optional):
 *  --out <path>     Output PNG, default: out.png
 *  --w <int>        Width, default: 800
 *  --h <int>        Height, default: 600
 *  --fov <deg>      Vertical FOV degrees, default: 60
 *  --noCull         Disable backface culling
 *  --noGamma        Disable simple gamma (sRGB-ish) output
 *  --cam <x,y,z>    Camera position (overrides auto-fit)
 *  --look <x,y,z>   Camera target (defaults to center if omitted)
 *  --light <x,y,z>  Directional light direction (world), default: [-0.4,-0.9,-0.2]
 *  --ambient <0..1> Ambient term, default: 0.15
 */

const fs = require("fs");
const path = require("path");
const stream = require("stream");
const PImage = require("pureimage");
const { mat2, mat3, mat4, vec2, vec3, vec4, quat } = require("gl-matrix");

// -------------------- CLI tiny parser --------------------
const argv = (() => {
	const out = { _: [] };
	const a = process.argv.slice(2);
	for (let i = 0; i < a.length; i++) {
		const tok = a[i];
		if (tok.startsWith("--")) {
			const key = tok.slice(2);
			const next = a[i + 1];
			if (next && !next.startsWith("--")) {
				out[key] = next;
				i++;
			} else out[key] = true;
		} else {
			out._.push(tok);
		}
	}
	return out;
})();
if (argv._.length === 0) {
	console.error(
		"Usage: node render_gltf_soft.js model.gltf [--out out.png] [--w 960] [--h 540] [--fov 60]",
	);
	process.exit(1);
}

const MODEL_PATH = argv._[0];
const OUT_PATH = argv.out || "out.png";
const WIDTH = parseInt(argv.w || "800", 10);
const HEIGHT = parseInt(argv.h || "600", 10);
const FOV_DEG = parseFloat(argv.fov || "60");
const CULL = argv.noCull ? false : true;
const GAMMA = argv.noGamma ? false : true;
const AMBIENT = Math.max(0, Math.min(1, parseFloat(argv.ambient || "0.15")));
const LIGHT_DIR = argv.light
	? argv.light.split(",").map(Number)
	: [-0.4, -0.9, -0.2];

const CAM_POS = argv.cam ? argv.cam.split(",").map(Number) : null;
const LOOK_AT = argv.look ? argv.look.split(",").map(Number) : null;

// -------------------- Small utils --------------------
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const toRad = (d) => (d * Math.PI) / 180;

function bufferFromDataURI(uri) {
	// data:application/octet-stream;base64,xxxx
	const m = uri.match(/^data:.*?;base64,(.*)$/);
	if (!m) throw new Error(`Unsupported data URI: ${uri.slice(0, 64)}...`);
	return Buffer.from(m[1], "base64");
}

function isPNG(filenameOrUri) {
	return (
		/\.png(\?|$)/i.test(filenameOrUri) || /image\/png/i.test(filenameOrUri)
	);
}
function isJPG(filenameOrUri) {
	return (
		/\.(jpg|jpeg)(\?|$)/i.test(filenameOrUri) ||
		/image\/jpe?g/i.test(filenameOrUri)
	);
}

function bufferToStream(buf) {
	const s = new stream.PassThrough();
	s.end(buf);
	return s;
}

function srgbEncodeLinear01(x) {
	// Simple sRGB transfer for output; keep it small & adequate.
	if (x <= 0.0031308) return 12.92 * x;
	return 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

function mulColor(a, b) {
	return [a[0] * b[0], a[1] * b[1], a[2] * b[2], a[3] * b[3]];
}

// -------------------- glTF loader (minimal but robust) --------------------
async function loadGLTF(gltfPath) {
	const baseDir = path.dirname(gltfPath);
	const gltf = JSON.parse(fs.readFileSync(gltfPath, "utf8"));

	// Load buffers
	const buffers = await Promise.all(
		(gltf.buffers || []).map(async (b) => {
			if (b.uri && b.uri.startsWith("data:")) {
				return bufferFromDataURI(b.uri);
			} else if (b.uri) {
				const p = path.resolve(baseDir, decodeURIComponent(b.uri));
				return fs.readFileSync(p);
			} else {
				throw new Error(
					"Buffer without uri not supported in this lightweight loader.",
				);
			}
		}),
	);

	function detectMimeTypeFromBuffer(buf, hint) {
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
		if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8)
			return "image/jpeg";
		return null;
	}

	async function decodeImageFromBuffer(buf, mimeType) {
		const type = detectMimeTypeFromBuffer(buf, mimeType);
		if (type === "image/png")
			return PImage.decodePNGFromStream(bufferToStream(buf));
		if (type === "image/jpeg" || type === "image/jpg")
			return PImage.decodeJPEGFromStream(bufferToStream(buf));
		throw new Error("Unsupported embedded image mimeType: " + (mimeType || "unknown"));
	}

	// Load images (uri, data-URI, or bufferView + mimeType)
	const images = await Promise.all(
		(gltf.images || []).map(async (img) => {
			if (img.uri) {
				if (img.uri.startsWith("data:")) {
					const buf = bufferFromDataURI(img.uri);
					if (isPNG(img.uri))
						return PImage.decodePNGFromStream(bufferToStream(buf));
					if (isJPG(img.uri))
						return PImage.decodeJPEGFromStream(bufferToStream(buf));
					throw new Error(
						`Unsupported data-URI image type for ${img.uri.slice(0, 32)}...`,
					);
				}
				const fpath = path.resolve(baseDir, decodeURIComponent(img.uri));
				if (isPNG(img.uri))
					return PImage.decodePNGFromStream(fs.createReadStream(fpath));
				if (isJPG(img.uri))
					return PImage.decodeJPEGFromStream(fs.createReadStream(fpath));
				// Try by sniffing extension anyway
				return PImage.decodePNGFromStream(fs.createReadStream(fpath)).catch(
					() => PImage.decodeJPEGFromStream(fs.createReadStream(fpath)),
				);
			}

			if (typeof img.bufferView === "number") {
				const bv = gltf.bufferViews[img.bufferView];
				if (!bv) throw new Error(`Invalid image bufferView index ${img.bufferView}`);
				const buffer = buffers[bv.buffer];
				if (!buffer) throw new Error(`Missing buffer for image bufferView ${img.bufferView}`);
				const byteOffset = bv.byteOffset || 0;
				const byteLength = bv.byteLength;
				if (typeof byteLength !== "number")
					throw new Error(`bufferView ${img.bufferView} missing byteLength for image.`);
				const slice = buffer.slice(byteOffset, byteOffset + byteLength);
				return decodeImageFromBuffer(slice, img.mimeType);
			}

			throw new Error(
				"images[*] entry missing uri or bufferView; unsupported in this lightweight loader.",
			);
		}),
	);

	// Accessor reading helpers
	const COMPONENT_INFO = {
		5120: {
			name: "BYTE",
			size: 1,
			array: Int8Array,
			norm: (v) => Math.max(-1, v / 127),
		},
		5121: {
			name: "UNSIGNED_BYTE",
			size: 1,
			array: Uint8Array,
			norm: (v) => v / 255,
		},
		5122: {
			name: "SHORT",
			size: 2,
			array: Int16Array,
			norm: (v) => Math.max(-1, v / 32767),
		},
		5123: {
			name: "UNSIGNED_SHORT",
			size: 2,
			array: Uint16Array,
			norm: (v) => v / 65535,
		},
		5125: {
			name: "UNSIGNED_INT",
			size: 4,
			array: Uint32Array,
			norm: (v) => v / 4294967295,
		},
		5126: { name: "FLOAT", size: 4, array: Float32Array, norm: (v) => v },
	};
	const NUM_COMP = {
		SCALAR: 1,
		VEC2: 2,
		VEC3: 3,
		VEC4: 4,
		MAT2: 4,
		MAT3: 9,
		MAT4: 16,
	};

	function readAccessorAsFloat32(accIndex) {
		const acc = gltf.accessors[accIndex];
		if (acc.sparse)
			throw new Error("Sparse accessors not supported (lightweight).");
		const bv = gltf.bufferViews[acc.bufferView];
		const comp = COMPONENT_INFO[acc.componentType];
		const ncomp = NUM_COMP[acc.type];
		const stride = bv.byteStride || comp.size * ncomp;
		const count = acc.count;

		const buf = buffers[bv.buffer];
		const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
		const src = new Uint8Array(
			buf.buffer,
			buf.byteOffset + base,
			bv.byteLength - (acc.byteOffset || 0),
		);

		const out = new Float32Array(count * ncomp);
		// If tightly packed, we can just create a typed view then map to float (handling normalization)
		const canUseTightView =
			stride === comp.size * ncomp && src.byteOffset % comp.size === 0;
		if (canUseTightView) {
			const Typed = comp.array;
			const tarr = new Typed(src.buffer, src.byteOffset, count * ncomp);
			if (comp.name === "FLOAT" && !acc.normalized)
				return new Float32Array(tarr.buffer, tarr.byteOffset, tarr.length);
			// normalize or cast
			for (let i = 0; i < tarr.length; i++)
				out[i] = acc.normalized ? comp.norm(tarr[i]) : tarr[i];
			return out;
		}
		// Strided: hop per element
		const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
		let off = 0;
		for (let i = 0; i < count; i++) {
			let o = i * stride;
			for (let c = 0; c < ncomp; c++) {
				let v;
				switch (acc.componentType) {
					case 5120:
						v = dv.getInt8(o + c * comp.size);
						break;
					case 5121:
						v = dv.getUint8(o + c * comp.size);
						break;
					case 5122:
						v = dv.getInt16(o + c * comp.size, true);
						break;
					case 5123:
						v = dv.getUint16(o + c * comp.size, true);
						break;
					case 5125:
						v = dv.getUint32(o + c * comp.size, true);
						break;
					case 5126:
						v = dv.getFloat32(o + c * comp.size, true);
						break;
					default:
						throw new Error("Unknown componentType");
				}
				out[off++] = acc.normalized
					? COMPONENT_INFO[acc.componentType].norm(v)
					: v;
			}
		}
		return out;
	}

	function readIndices(accIndex) {
		const acc = gltf.accessors[accIndex];
		if (acc.type !== "SCALAR")
			throw new Error("Indices accessor must be SCALAR");
		const bv = gltf.bufferViews[acc.bufferView];
		const comp = COMPONENT_INFO[acc.componentType];
		if (
			acc.componentType !== 5121 &&
			acc.componentType !== 5123 &&
			acc.componentType !== 5125
		) {
			throw new Error("Index componentType must be UNSIGNED_BYTE/SHORT/INT");
		}
		const stride = bv.byteStride || comp.size;
		const count = acc.count;
		const buf = buffers[bv.buffer];
		const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
		const src = new Uint8Array(
			buf.buffer,
			buf.byteOffset + base,
			bv.byteLength - (acc.byteOffset || 0),
		);

		const canUseTightView =
			stride === comp.size && src.byteOffset % comp.size === 0;
		if (canUseTightView) {
			const Typed = comp.array;
			const tarr = new Typed(src.buffer, src.byteOffset, count);
			// normalize to Uint32 for simplicity
			return acc.componentType === 5125
				? new Uint32Array(tarr.buffer, tarr.byteOffset, tarr.length)
				: new Uint32Array(tarr);
		}
		// strided
		const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
		const out = new Uint32Array(count);
		for (let i = 0; i < count; i++) {
			const o = i * stride;
			let v;
			switch (acc.componentType) {
				case 5121:
					v = dv.getUint8(o);
					break;
				case 5123:
					v = dv.getUint16(o, true);
					break;
				case 5125:
					v = dv.getUint32(o, true);
					break;
			}
			out[i] = v >>> 0;
		}
		return out;
	}

	// Materials
	const textures = gltf.textures || [];
	function getMaterial(matIndex) {
		const m = (gltf.materials || [])[matIndex] || {};
		const pbr = m.pbrMetallicRoughness || {};
		const factor = pbr.baseColorFactor || [1, 1, 1, 1];
		let texImg = null;
		if (pbr.baseColorTexture && Number.isInteger(pbr.baseColorTexture.index)) {
			const t = textures[pbr.baseColorTexture.index];
			if (t && Number.isInteger(t.source)) texImg = images[t.source] || null;
		}
		return { baseColorFactor: factor, baseColorTexture: texImg };
	}

	// Node graph: compute global transforms & collect draw calls
	const nodes = gltf.nodes || [];
	const meshes = gltf.meshes || [];
	const scenes = gltf.scenes || [];
	const sceneIndex = Number.isInteger(gltf.scene) ? gltf.scene : 0;
	const scene = scenes[sceneIndex] || { nodes: [] };

	const drawCalls = []; // { positions, indices, normals, uvs, model, material }
	function nodeLocalMatrix(n) {
		if (n.matrix) {
			const m = mat4.create();
			for (let i = 0; i < 16; i++) m[i] = n.matrix[i];
			return m;
		}
		const t = n.translation || [0, 0, 0];
		const r = n.rotation || [0, 0, 0, 1];
		const s = n.scale || [1, 1, 1];
		const m = mat4.create();
		const mq = mat4.create();
		mat4.fromRotationTranslationScale(mq, r, t, s);
		mat4.copy(m, mq);
		return m;
	}
	function traverse(nodeIndex, parentMatrix) {
		const n = nodes[nodeIndex];
		const local = nodeLocalMatrix(n);
		const world = mat4.create();
		mat4.multiply(world, parentMatrix, local);

		if (Number.isInteger(n.mesh)) {
			const mesh = meshes[n.mesh];
			for (const prim of mesh.primitives) {
				if (prim.mode != null && prim.mode !== 4 /* TRIANGLES */) continue; // TRIANGLES only
				const posAcc = prim.attributes.POSITION;
				if (posAcc == null) continue;
				const norAcc = prim.attributes.NORMAL;
				const uvAcc = prim.attributes.TEXCOORD_0;

				const positions = readAccessorAsFloat32(posAcc);
				const normals = norAcc != null ? readAccessorAsFloat32(norAcc) : null;
				const uvs = uvAcc != null ? readAccessorAsFloat32(uvAcc) : null;
				const indices = prim.indices != null ? readIndices(prim.indices) : null;

				const material = getMaterial(prim.material);
				drawCalls.push({
					positions,
					normals,
					uvs,
					indices,
					model: world,
					material,
				});
			}
		}
		for (const c of n.children || []) traverse(c, world);
	}
	const I = mat4.create();
	for (const root of scene.nodes || []) traverse(root, I);

	return { gltf, drawCalls };
}

// -------------------- Software rasterizer --------------------
class SoftwareRenderer {
	constructor(w, h, options = {}) {
		this.w = w;
		this.h = h;
		this.img = PImage.make(w, h);
		this.buf = this.img.data; // Uint8Array RGBA
		this.depth = new Float32Array(w * h);
		this.options = options;
		this.clear([0, 0, 0, 255]);
	}

	clear(colorRGBA = [0, 0, 0, 255]) {
		const [r, g, b, a] = colorRGBA;
		for (let i = 0; i < this.w * this.h; i++) {
			const j = i * 4;
			this.buf[j + 0] = r;
			this.buf[j + 1] = g;
			this.buf[j + 2] = b;
			this.buf[j + 3] = a;
			this.depth[i] = Infinity;
		}
	}

	setPixel(x, y, r, g, b, a) {
		if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
		const idx = (y * this.w + x) * 4;
		this.buf[idx + 0] = r;
		this.buf[idx + 1] = g;
		this.buf[idx + 2] = b;
		this.buf[idx + 3] = a;
	}

	// Sample nearest from pureimage bitmap (u,v in [0,1])
	sampleTextureNearest(img, u, v) {
		if (!img) return [1, 1, 1, 1];
		// glTF uses UV origin top-left; pureimage stores row 0 at the top, so we do NOT flip v.
		const x = clamp(Math.floor(u * (img.width - 1)), 0, img.width - 1);
		const y = clamp(Math.floor(v * (img.height - 1)), 0, img.height - 1);
		const idx = (y * img.width + x) * 4;
		const d = img.data;
		return [
			d[idx + 0] / 255,
			d[idx + 1] / 255,
			d[idx + 2] / 255,
			d[idx + 3] / 255,
		];
	}

	// p: screen-space barycentric weights; invW: per-vertex 1/w; attrs: array of VecN
	perspInterp(attrs, invWs, lambdas) {
		const denom =
			lambdas[0] * invWs[0] + lambdas[1] * invWs[1] + lambdas[2] * invWs[2];
		const n = attrs[0].length;
		const out = new Array(n).fill(0);
		for (let j = 0; j < n; j++) {
			out[j] =
				(lambdas[0] * attrs[0][j] * invWs[0] +
					lambdas[1] * attrs[1][j] * invWs[1] +
					lambdas[2] * attrs[2][j] * invWs[2]) /
				denom;
		}
		return out;
	}

	drawMesh(
		mesh,
		camera,
		light,
		material,
		cullBackFaces = true,
		gammaOut = true,
	) {
		const { positions, normals, uvs, indices, model } = mesh;

		// Precompute transforms
		const view = camera.view;
		const proj = camera.proj;
		const mvp = mat4.create();
		mat4.multiply(mvp, proj, mat4.multiply(mat4.create(), view, model));

		// Normal matrix (for world-space lighting, we’ll use world normals)
		const normalMat = mat3.create();
		mat3.normalFromMat4(normalMat, model);

		// Build an index array if none
		const vertCount = (positions.length / 3) | 0;
		const idx =
			indices ||
			(() => {
				const a = new Uint32Array(vertCount);
				for (let i = 0; i < vertCount; i++) a[i] = i;
				return a;
			})();

		// Ensure normals exist (smooth) if missing
		let useNormals = normals;
		if (!useNormals) {
			useNormals = computeSmoothNormals(positions, idx);
		}

		// Pre-transform vertices to clip space + cache screen coords & invW & ndcZ
		const vScreen = new Array(vertCount);
		const vInvW = new Float32Array(vertCount);
		const vNDCz = new Float32Array(vertCount);
		const vWorldN = new Array(vertCount);

		for (let i = 0; i < vertCount; i++) {
			const p = vec4.fromValues(
				positions[i * 3 + 0],
				positions[i * 3 + 1],
				positions[i * 3 + 2],
				1,
			);
			const c = vec4.create();
			vec4.transformMat4(c, p, mvp);
			const invW = 1 / c[3];
			const ndcX = c[0] * invW;
			const ndcY = c[1] * invW;
			const ndcZ = c[2] * invW;

			// Screen coordinates
			const sx = Math.round((ndcX * 0.5 + 0.5) * (this.w - 1));
			const sy = Math.round((1 - (ndcY * 0.5 + 0.5)) * (this.h - 1)); // Y down

			vScreen[i] = [sx, sy];
			vInvW[i] = invW;
			vNDCz[i] = ndcZ;

			// Transform normal to world (for lighting); defer normalization to per-pixel
			const n = vec3.fromValues(
				useNormals[i * 3 + 0],
				useNormals[i * 3 + 1],
				useNormals[i * 3 + 2],
			);
			const nw = vec3.create();
			vec3.transformMat3(nw, n, normalMat);
			vWorldN[i] = nw; // normalized later
		}

		// Render triangles
		for (let i = 0; i < idx.length; i += 3) {
			const i0 = idx[i + 0] >>> 0;
			const i1 = idx[i + 1] >>> 0;
			const i2 = idx[i + 2] >>> 0;

			// Clip coarse: drop triangle if any w <= 0 (behind camera) to avoid weirdness
			if (!(isFinite(vInvW[i0]) && isFinite(vInvW[i1]) && isFinite(vInvW[i2])))
				continue;

			const v0 = vScreen[i0],
				v1 = vScreen[i1],
				v2 = vScreen[i2];

			// Backface
			const area = edge(v0, v1, v2);
			if (area === 0) continue;
			if (cullBackFaces && area < 0) continue;

			// Bounding box
			let minX = Math.max(0, Math.min(v0[0], v1[0], v2[0]) | 0);
			let maxX = Math.min(this.w - 1, Math.max(v0[0], v1[0], v2[0]) | 0);
			let minY = Math.max(0, Math.min(v0[1], v1[1], v2[1]) | 0);
			let maxY = Math.min(this.h - 1, Math.max(v0[1], v1[1], v2[1]) | 0);

			// Per-vertex packs for interpolation
			const invW = [vInvW[i0], vInvW[i1], vInvW[i2]];
			const ndcZ = [vNDCz[i0], vNDCz[i1], vNDCz[i2]];
			const nws = [vWorldN[i0], vWorldN[i1], vWorldN[i2]];
			const uv = uvs
				? [
						[uvs[i0 * 2 + 0], uvs[i0 * 2 + 1]],
						[uvs[i1 * 2 + 0], uvs[i1 * 2 + 1]],
						[uvs[i2 * 2 + 0], uvs[i2 * 2 + 1]],
					]
				: null;

			// Raster
			for (let y = minY; y <= maxY; y++) {
				for (let x = minX; x <= maxX; x++) {
					const p = [x + 0.5, y + 0.5];
					const w0 = edge(v1, v2, p);
					const w1 = edge(v2, v0, p);
					const w2 = edge(v0, v1, p);
					if (w0 < 0 || w1 < 0 || w2 < 0) continue; // outside

					const invArea = 1 / area;
					const l0 = w0 * invArea,
						l1 = w1 * invArea,
						l2 = w2 * invArea;

					// Depth: NDC z can be linearly interpolated in screen space
					const zndc = l0 * ndcZ[0] + l1 * ndcZ[1] + l2 * ndcZ[2];
					const z01 = zndc * 0.5 + 0.5;
					const di = y * this.w + x;
					if (z01 >= this.depth[di]) continue;
					this.depth[di] = z01;

					// Perspective-correct interpolate UV and normal
					let baseColor = material.baseColorFactor.slice(0, 4); // [r,g,b,a]
					if (uv && material.baseColorTexture) {
						const uvp = this.perspInterp(uv, invW, [l0, l1, l2]); // [u,v]
						const texel = this.sampleTextureNearest(
							material.baseColorTexture,
							uvp[0],
							uvp[1],
						);
						baseColor = mulColor(baseColor, texel);
					}

					const np = this.perspInterp(nws, invW, [l0, l1, l2]); // world normal
					const nlen = Math.hypot(np[0], np[1], np[2]) || 1;
					const nrm = [np[0] / nlen, np[1] / nlen, np[2] / nlen];

					// Lighting: Lambert + ambient
					const L = vec3.normalize(
						vec3.create(),
						vec3.fromValues(LIGHT_DIR[0], LIGHT_DIR[1], LIGHT_DIR[2]),
					);
					const ndotl = Math.max(
						0,
						nrm[0] * -L[0] + nrm[1] * -L[1] + nrm[2] * -L[2],
					);
					const lit = AMBIENT + (1 - AMBIENT) * ndotl;

					let r = baseColor[0] * lit;
					let g = baseColor[1] * lit;
					let b = baseColor[2] * lit;
					let a = baseColor[3];

					// Gamma encode to sRGB-ish for nicer PNGs
					if (gammaOut) {
						r = srgbEncodeLinear01(clamp(r, 0, 1));
						g = srgbEncodeLinear01(clamp(g, 0, 1));
						b = srgbEncodeLinear01(clamp(b, 0, 1));
					} else {
						r = clamp(r, 0, 1);
						g = clamp(g, 0, 1);
						b = clamp(b, 0, 1);
					}

					this.setPixel(
						x,
						y,
						(r * 255) | 0,
						(g * 255) | 0,
						(b * 255) | 0,
						(clamp(a, 0, 1) * 255) | 0,
					);
				}
			}
		}
	}
}

// 2D edge function for barycentric
function edge(a, b, p) {
	return (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
}

// If NORMAL missing, compute smooth vertex normals from indexed triangles
function computeSmoothNormals(positions, indices) {
	const n = new Float32Array(positions.length);
	const vc = (positions.length / 3) | 0;
	const idx =
		indices ||
		(() => {
			const a = new Uint32Array(vc);
			for (let i = 0; i < vc; i++) a[i] = i;
			return a;
		})();

	for (let i = 0; i < idx.length; i += 3) {
		const i0 = idx[i + 0],
			i1 = idx[i + 1],
			i2 = idx[i + 2];
		const p0 = [
			positions[i0 * 3 + 0],
			positions[i0 * 3 + 1],
			positions[i0 * 3 + 2],
		];
		const p1 = [
			positions[i1 * 3 + 0],
			positions[i1 * 3 + 1],
			positions[i1 * 3 + 2],
		];
		const p2 = [
			positions[i2 * 3 + 0],
			positions[i2 * 3 + 1],
			positions[i2 * 3 + 2],
		];
		const v10 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
		const v20 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
		const nx = v10[1] * v20[2] - v10[2] * v20[1];
		const ny = v10[2] * v20[0] - v10[0] * v20[2];
		const nz = v10[0] * v20[1] - v10[1] * v20[0];
		n[i0 * 3 + 0] += nx;
		n[i0 * 3 + 1] += ny;
		n[i0 * 3 + 2] += nz;
		n[i1 * 3 + 0] += nx;
		n[i1 * 3 + 1] += ny;
		n[i1 * 3 + 2] += nz;
		n[i2 * 3 + 0] += nx;
		n[i2 * 3 + 1] += ny;
		n[i2 * 3 + 2] += nz;
	}
	for (let i = 0; i < vc; i++) {
		const nx = n[i * 3 + 0],
			ny = n[i * 3 + 1],
			nz = n[i * 3 + 2];
		const inv = 1 / (Math.hypot(nx, ny, nz) || 1);
		n[i * 3 + 0] = nx * inv;
		n[i * 3 + 1] = ny * inv;
		n[i * 3 + 2] = nz * inv;
	}
	return n;
}

// Compute world-space AABB (slow but simple) to auto-fit camera
function computeWorldAABB(drawCalls) {
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];
	const tmp = vec4.create();
	for (const dc of drawCalls) {
		const { positions, model } = dc;
		for (let i = 0; i < positions.length; i += 3) {
			vec4.set(tmp, positions[i], positions[i + 1], positions[i + 2], 1);
			vec4.transformMat4(tmp, tmp, model);
			min[0] = Math.min(min[0], tmp[0]);
			min[1] = Math.min(min[1], tmp[1]);
			min[2] = Math.min(min[2], tmp[2]);
			max[0] = Math.max(max[0], tmp[0]);
			max[1] = Math.max(max[1], tmp[1]);
			max[2] = Math.max(max[2], tmp[2]);
		}
	}
	return { min, max };
}

// Build camera (lookAt + perspective). If no CAM_POS provided, fit to aabb.
function buildCamera(drawCalls, width, height, fovDeg, camPosOpt, lookAtOpt) {
	const aspect = width / height;
	const near = 0.01,
		far = 1000.0;
	const proj = mat4.create();
	mat4.perspective(proj, toRad(fovDeg), aspect, near, far);

	let eye, center;
	if (camPosOpt) {
		eye = vec3.fromValues(camPosOpt[0], camPosOpt[1], camPosOpt[2]);
		if (lookAtOpt)
			center = vec3.fromValues(lookAtOpt[0], lookAtOpt[1], lookAtOpt[2]);
		else {
			const aabb = computeWorldAABB(drawCalls);
			center = vec3.fromValues(
				0.5 * (aabb.min[0] + aabb.max[0]),
				0.5 * (aabb.min[1] + aabb.max[1]),
				0.5 * (aabb.min[2] + aabb.max[2]),
			);
		}
	} else {
		const aabb = computeWorldAABB(drawCalls);
		center = vec3.fromValues(
			0.5 * (aabb.min[0] + aabb.max[0]),
			0.5 * (aabb.min[1] + aabb.max[1]),
			0.5 * (aabb.min[2] + aabb.max[2]),
		);
		const diag = vec3.distance(
			vec3.fromValues(aabb.min[0], aabb.min[1], aabb.min[2]),
			vec3.fromValues(aabb.max[0], aabb.max[1], aabb.max[2]),
		);
		const radius = diag * 0.5;
		const fov = toRad(fovDeg);
		const dist = radius / Math.tan(fov * 0.5) + radius * 0.5; // a bit of padding
		eye = vec3.fromValues(
			center[0] + dist,
			center[1] + dist * 0.3,
			center[2] + dist,
		);
	}

	const up = vec3.fromValues(0, 1, 0);
	const view = mat4.create();
	mat4.lookAt(view, eye, center, up);
	return { view, proj };
}

// -------------------- Main --------------------
(async function main() {
	const { drawCalls } = await loadGLTF(MODEL_PATH);

	const camera = buildCamera(
		drawCalls,
		WIDTH,
		HEIGHT,
		FOV_DEG,
		CAM_POS,
		LOOK_AT,
	);
	const renderer = new SoftwareRenderer(WIDTH, HEIGHT);

	for (const dc of drawCalls) {
		renderer.drawMesh(dc, camera, { dir: LIGHT_DIR }, dc.material, CULL, GAMMA);
	}

	await PImage.encodePNGToStream(renderer.img, fs.createWriteStream(OUT_PATH));
	console.log(`Wrote ${OUT_PATH} (${WIDTH}x${HEIGHT})`);
})().catch((err) => {
	console.error(err);
	process.exit(1);
});
