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

  expect(result.globalsBeforeImport.hasBufferGlobal).toBe(false)
  expect(result.globalsBeforeImport.hasProcessGlobal).toBe(false)

  expect(result.inMemory.isUint8Array).toBe(true)
  expect(result.inMemory.constructorName).toBe("Uint8Array")
  expect(result.inMemory.length).toBeGreaterThan(100)
  expect(result.inMemory.hasValidPngSignature).toBe(true)
  expect(result.inMemory.width).toBe(96)
  expect(result.inMemory.height).toBe(72)

  expect(result.url.isUint8Array).toBe(true)
  expect(result.url.constructorName).toBe("Uint8Array")
  expect(result.url.length).toBeGreaterThan(100)
  expect(result.url.hasValidPngSignature).toBe(true)

  expect(result.glb.isUint8Array).toBe(true)
  expect(result.glb.constructorName).toBe("Uint8Array")
  expect(result.glb.length).toBeGreaterThan(100)
  expect(result.glb.hasValidPngSignature).toBe(true)
})
