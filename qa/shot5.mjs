import { chromium } from 'playwright'
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ru-RU' })
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
// login as Mister to see the full UI
await page.evaluate(() => {
  const inp = document.querySelector('input')
  return inp ? inp.placeholder : 'no-input'
}).catch(() => 'n/a')
// navigate: find profile tab
for (const label of ['Профиль', 'Профіль', 'Profile']) {
  const btn = page.locator(`button.press:has-text("${label}")`)
  if (await btn.count()) { await btn.click(); break }
}
await page.waitForTimeout(400)
await page.screenshot({ path: 'qa/shot5-profile.jpg', type: 'jpeg', quality: 80 })
await b.close()
console.log('done')
