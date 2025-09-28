export function computeSmoothNormals(
	positions: Float32Array,
	indices: Uint32Array | null,
): Float32Array {
	const normals = new Float32Array(positions.length);
	const vertexCount = (positions.length / 3) | 0;
	const indexArray =
		indices ?? (() => {
			const arr = new Uint32Array(vertexCount);
			for (let i = 0; i < vertexCount; i++) arr[i] = i;
			return arr;
		})();

	for (let i = 0; i < indexArray.length; i += 3) {
		const i0 = indexArray[i + 0];
		const i1 = indexArray[i + 1];
		const i2 = indexArray[i + 2];
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
		normals[i0 * 3 + 0] += nx;
		normals[i0 * 3 + 1] += ny;
		normals[i0 * 3 + 2] += nz;
		normals[i1 * 3 + 0] += nx;
		normals[i1 * 3 + 1] += ny;
		normals[i1 * 3 + 2] += nz;
		normals[i2 * 3 + 0] += nx;
		normals[i2 * 3 + 1] += ny;
		normals[i2 * 3 + 2] += nz;
	}

	for (let i = 0; i < vertexCount; i++) {
		const nx = normals[i * 3 + 0];
		const ny = normals[i * 3 + 1];
		const nz = normals[i * 3 + 2];
		const invLength = 1 / (Math.hypot(nx, ny, nz) || 1);
		normals[i * 3 + 0] = nx * invLength;
		normals[i * 3 + 1] = ny * invLength;
		normals[i * 3 + 2] = nz * invLength;
	}

	return normals;
}
