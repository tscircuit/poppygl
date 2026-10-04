import { expect, test } from "bun:test"
import { EXAMPLES, renderExample } from "../../scripts/realistic-examples"
import "../fixtures/preload"

for (const example of EXAMPLES)
  test(
    `${example.title} has a realistic studio snapshot`,
    async () => {
      const result = await renderExample(example, 200, 1)
      expect(result.realistic).not.toEqual(result.legacy)
      await expect(result.comparison).toMatchPngSnapshot(
        import.meta.path,
        example.id,
      )
    },
    { timeout: 180_000 },
  )
