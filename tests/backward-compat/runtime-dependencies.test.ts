import { expect, test } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"

// The build externalizes node_modules, so every package imported from lib/ must be installable by consumers.
test("every package imported by lib/ is a runtime or peer dependency", () => {
  const root = path.join(import.meta.dir, "../..")
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  )
  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ])

  const imported = new Set<string>()
  const importRe = /(?:from\s+|import\s*\(\s*)["']([^"'.][^"']*)["']/g
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry.name)) {
        for (const m of fs.readFileSync(full, "utf8").matchAll(importRe)) {
          const spec = m[1]!
          if (spec.startsWith("node:")) continue
          const parts = spec.split("/")
          imported.add(
            spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!,
          )
        }
      }
    }
  }
  walk(path.join(root, "lib"))

  const missing = [...imported].filter((name) => !declared.has(name)).sort()
  expect(missing).toEqual([])
})
