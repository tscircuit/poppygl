export function parseVec3(value: unknown): [number, number, number] | null {
	if (typeof value !== "string") return null;
	const parts = value.split(",").map(Number);
	if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
	return [parts[0], parts[1], parts[2]];
}
