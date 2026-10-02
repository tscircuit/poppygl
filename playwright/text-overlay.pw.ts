import { expect, test } from "@playwright/test"

test("message pixels remain fixed while the interactive viewer orbits", async ({
  page,
}) => {
  const fixtureId = encodeURIComponent(
    JSON.stringify({ path: "site/examples/text-overlay.page.tsx" }),
  )
  await page.goto(`/renderer.html?fixtureId=${fixtureId}&locked=true`)
  await expect(
    page.getByRole("heading", { name: "Fixed text overlay" }),
  ).toBeVisible()
  const canvas = page.locator("canvas")
  await expect
    .poll(async () =>
      canvas.evaluate(
        (element) =>
          (element as HTMLCanvasElement)
            .getContext("2d")!
            .getImageData(0, 599, 1, 1).data[0],
      ),
    )
    .toBe(35)
  const pixels = async () =>
    canvas.evaluate((node) => {
      const element = node as HTMLCanvasElement
      const context = element.getContext("2d")!
      const data = context.getImageData(
        0,
        0,
        element.width,
        element.height,
      ).data
      let top = 0
      for (; top < element.height; top++) {
        const index = top * element.width * 4
        if (
          data[index] === 35 &&
          data[index + 1] === 42 &&
          data[index + 2] === 52
        )
          break
      }
      return {
        footer: Array.from(data.slice(top * element.width * 4)),
        circuit: Array.from(data.slice(0, 300 * element.width * 4)),
      }
    })
  const first = await pixels()
  const bounds = (await canvas.boundingBox())!
  await page.mouse.move(bounds.x + 400, bounds.y + 200)
  await page.mouse.down()
  await page.mouse.move(bounds.x + 580, bounds.y + 230, { steps: 12 })
  await page.mouse.up()
  await expect
    .poll(async () => JSON.stringify((await pixels()).circuit))
    .not.toBe(JSON.stringify(first.circuit))
  expect((await pixels()).footer).toEqual(first.footer)
})
