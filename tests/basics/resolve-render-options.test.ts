import { expect, test } from "bun:test"
import { resolveRenderOptions } from "../../lib/render/resolveRenderOptions"

test("antialias enables 2x supersampling by default", () => {
  const options = resolveRenderOptions({ antialias: true })

  expect(options.antialias).toBe(true)
  expect(options.supersampling).toBe(2)
})

test("explicit supersampling overrides antialias default", () => {
  const options = resolveRenderOptions({ antialias: true, supersampling: 3 })

  expect(options.antialias).toBe(true)
  expect(options.supersampling).toBe(3)
})
