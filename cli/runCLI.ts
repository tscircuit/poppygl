#!/usr/bin/env node
import { DEFAULT_LIGHT_DIR, DEFAULT_RENDER_OPTIONS } from "../lib/render/getDefaultRenderOptions";
import { clamp } from "../lib/utils/clamp";
import { parseCliArgs } from "./parseCliArgs";
import { parseVec3 } from "./parseVec3";
import { isMainModule } from "./isMainModule";
import { renderGLTFToPNGFile } from "./renderGLTFToPNGFile";

export async function runCLI() {
	const argv = parseCliArgs(process.argv.slice(2));
	if (argv._.length === 0) {
		console.error(
			"Usage: poppygl model.gltf [--out out.png] [--w 960] [--h 540] [--fov 60]",
		);
		process.exit(1);
	}

	const gltfPath = argv._[0];
	const outPath = typeof argv.out === "string" ? argv.out : "out.png";
	const width = parseInt(
		typeof argv.w === "string" ? argv.w : `${DEFAULT_RENDER_OPTIONS.width}`,
		10,
	);
	const height = parseInt(
		typeof argv.h === "string" ? argv.h : `${DEFAULT_RENDER_OPTIONS.height}`,
		10,
	);
	const fov = parseFloat(
		typeof argv.fov === "string" ? argv.fov : `${DEFAULT_RENDER_OPTIONS.fov}`,
	);
	const ambient = clamp(
		parseFloat(
			typeof argv.ambient === "string"
				? argv.ambient
				: `${DEFAULT_RENDER_OPTIONS.ambient}`,
		),
		0,
		1,
	);
	const lightDir = parseVec3(argv.light) ?? (DEFAULT_LIGHT_DIR as [number, number, number]);
	const camPos = parseVec3(argv.cam);
	const lookAt = parseVec3(argv.look);
	const cull = argv.noCull ? false : true;
	const gamma = argv.noGamma ? false : true;

	await renderGLTFToPNGFile(gltfPath, outPath, {
		width,
		height,
		fov,
		ambient,
		lightDir,
		camPos,
		lookAt,
		cull,
		gamma,
	});
	console.log(`Wrote ${outPath} (${width}x${height})`);
}

if (isMainModule(import.meta)) {
	runCLI().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
