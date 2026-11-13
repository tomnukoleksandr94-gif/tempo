import { chromium } from 'playwright'
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ru-RU' })
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.screenshot({ path: 'qa/shot6-home.jpg', type: 'jpeg', quality: 80 })
await page.locator('button.press:has-text("Профиль")').click()
await page.waitForTimeout(600)
await page.screenshot({ path: 'qa/shot6-profile.jpg', type: 'jpeg', quality: 80 })
await page.locator('button.press:has-text("Биллинг")').click().catch(async () => {
  for (const l of ['Биллинг', 'Оплата', 'Billing']) {
    const btn = page.locator(`button.press:has-text("${l}")`)
    if (await btn.count()) { await btn.click(); break }
  }
})
await page.waitForTimeout(600)
await page.screenshot({ path: 'qa/shot6-billing.jpg', type: 'jpeg', quality: 80 })
await b.close()
console.log('done')
