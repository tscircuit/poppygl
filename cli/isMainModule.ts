import { pathToFileURL } from "node:url";

export function isMainModule(meta: ImportMeta): boolean {
	if (meta && typeof (meta as any).main === "boolean") return Boolean((meta as any).main);
	if (!process.argv[1]) return false;
	try {
		const entryHref = pathToFileURL(process.argv[1]).href;
		return entryHref === meta.url;
	} catch {
		return false;
	}
}
