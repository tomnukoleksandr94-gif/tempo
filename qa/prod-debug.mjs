import { chromium } from 'playwright'
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ru-RU' })
page.on('response', (r) => { if (r.url().includes('/api/')) console.log('API:', r.status(), r.request().method(), r.url().split('/api/')[1]) })
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERR:', m.text().slice(0, 200)) })
await page.goto('https://tempo-ai-life-os.pplx.app', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.locator('input[placeholder*="Записать"]').fill('Потратил 5 евро на кофе')
await page.keyboard.press('Enter')
try {
  await page.waitForSelector('text=Проверьте и подтвердите', { timeout: 90000 })
  console.log('PROD AI FLOW: PASS')
} catch {
  console.log('PROD AI FLOW: FAIL')
  await page.screenshot({ path: 'qa/shot-prod-debug.jpg', type: 'jpeg', quality: 80 })
}
await b.close()
