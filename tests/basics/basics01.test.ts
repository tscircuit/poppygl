import { test, expect } from "bun:test";
import { fileURLToPath } from "node:url";
import { renderGLTFToPNGBuffer } from "../../lib/main.ts";
import "../fixtures/preload.ts";

test("basics01", async () => {
	const gltfPath = fileURLToPath(new URL("./circuit.gltf", import.meta.url));
	const pngBuffer = await renderGLTFToPNGBuffer(gltfPath, {
		width: 320,
		height: 240,
	});
	await expect(pngBuffer).toMatchPngSnapshot(import.meta.path);
});
