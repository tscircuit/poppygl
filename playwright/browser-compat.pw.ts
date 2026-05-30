import { expect, test } from "@playwright/test"

test("browser root export renders without Node globals", async ({ page }) => {
  const fixtureId = encodeURIComponent(
    JSON.stringify({ path: "site/examples/browser-compat.page.tsx" }),
  )

  await page.goto(`/renderer.html?fixtureId=${fixtureId}&locked=true`)

  await expect(
    page.getByRole("heading", { name: "Browser Compatibility Fixture" }),
  ).toBeVisible()

  await expect
    .poll(async () => {
      return await page.getByTestId("compat-state").textContent()
    })
    .not.toContain('"status": "running"')

  const result = JSON.parse(
    (await page.getByTestId("compat-state").textContent()) ?? "null",
  )
  expect(result.status).toBe("done")
  expect(result.noNodeGlobals).toBe(true)

  expect(result.renders.inMemory.width).toBe(320)
  expect(result.renders.inMemory.height).toBe(240)
  expect(result.renders.inMemory.dataUrl).toContain("data:image/png")

  expect(result.renders.fromUrl.dataUrl).toContain("data:image/png")
  expect(result.renders.fromGlb.dataUrl).toContain("data:image/png")
})
